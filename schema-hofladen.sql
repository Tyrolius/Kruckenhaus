-- ============================================================
-- D1-SCHEMA – Hofladen-Vorbestellung
-- ============================================================
-- Tabellen für die Vorbestellung von Fleisch, Eiernudeln und Honig
-- in Chargen (Plan: docs/HOFLADEN-VORBESTELLUNG.md, Abschnitt 9.2).
--
-- Anlegen/aktualisieren (darf mehrfach ausgeführt werden):
--   npx wrangler d1 execute kruckenhaus --remote --file=./schema-hofladen.sql
--
-- Unabhängig von schema.sql (Tabelle "anfragen") und vom vorbereiteten
-- Buchungsmodell (einheiten, preisperioden, buchungen, naechte) – diese
-- Tabellen werden hier weder verändert noch gelöscht.
--
-- Konventionen:
--   Beträge in Cent (INTEGER), Gewichte in Gramm (INTEGER),
--   Datum als 'YYYY-MM-DD', Zeitpunkte als datetime('now') (UTC).
-- ============================================================


-- ------------------------------------------------------------
-- Kunden: eine Kartei für Website-, WhatsApp- und Telefonbestellungen
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kunden (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  telefon         TEXT,
  email           TEXT,
  strasse         TEXT,
  plz             TEXT,
  ort             TEXT,
  stammkunde      INTEGER NOT NULL DEFAULT 0 CHECK (stammkunde IN (0, 1)),
  newsletter      INTEGER NOT NULL DEFAULT 0 CHECK (newsletter IN (0, 1)),
  newsletter_seit TEXT,             -- Zeitpunkt der Einwilligung (Nachweis)
  abmelde_token   TEXT UNIQUE,      -- für den Abmeldelink im Newsletter
  notiz           TEXT,             -- intern, z. B. „liefert an Nachbarn"
  erstellt_am     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kunden_name    ON kunden (name);
CREATE INDEX IF NOT EXISTS idx_kunden_telefon ON kunden (telefon);
CREATE INDEX IF NOT EXISTS idx_kunden_email   ON kunden (email);


-- ------------------------------------------------------------
-- Produktkatalog: jedes Produkt einmal, Preise stehen je Charge
-- art: 'gewicht' (Huhn, Pute, Gans – Preis pro kg, Endpreis nach Wiegen)
--      'paket'   (Rindfleisch 5 kg / 10 kg – Fixpreis)
--      'stueck'  (Eiernudeln, Honig – Fixpreis)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produkte (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  art                TEXT    NOT NULL CHECK (art IN ('gewicht', 'paket', 'stueck')),
  beschreibung       TEXT,             -- z. B. Inhalt des Rind-Pakets
  pflichtangaben     TEXT,             -- Zutaten, Herkunft, Lagerhinweis, Füllmenge
  allergene          TEXT,             -- z. B. „Ei, Gluten"
  richtgewicht_von_g INTEGER,          -- nur Gewichtsware: für den „ca."-Preis
  richtgewicht_bis_g INTEGER,
  bild               TEXT,             -- Pfad unter images/
  aktiv              INTEGER NOT NULL DEFAULT 1 CHECK (aktiv IN (0, 1)),
  reihenfolge        INTEGER NOT NULL DEFAULT 0,
  erstellt_am        TEXT    NOT NULL DEFAULT (datetime('now')),
  -- IS NOT NULL ausdrücklich: ein CHECK mit NULL-Ergebnis gilt sonst als erfüllt
  CHECK (art <> 'gewicht'
         OR (richtgewicht_von_g IS NOT NULL AND richtgewicht_bis_g IS NOT NULL
             AND richtgewicht_von_g > 0 AND richtgewicht_bis_g >= richtgewicht_von_g))
);


-- ------------------------------------------------------------
-- Chargen: eine Schlachtung bzw. ein Verkaufsdurchgang
-- status: 'entwurf'     – nur in der Verwaltung sichtbar
--         'stammkunden' – nur über den Stammkunden-Link bestellbar
--         'offen'       – für alle bestellbar
--         'geschlossen' – Bestellschluss vorbei, wird abgewickelt
--         'archiviert'  – fertig, bleibt für die Jahresübersicht
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chargen (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  titel             TEXT    NOT NULL,
  beschreibung      TEXT,
  status            TEXT    NOT NULL DEFAULT 'entwurf'
                    CHECK (status IN ('entwurf', 'stammkunden', 'offen', 'geschlossen', 'archiviert')),
  stammkunden_ab    TEXT,
  offen_ab          TEXT,
  bestellschluss    TEXT    NOT NULL,
  stammkunden_token TEXT UNIQUE,
  erstellt_am       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chargen_status ON chargen (status);


-- ------------------------------------------------------------
-- Artikel einer Charge: Produkt + Preis + Kontingent
-- preis_cent: bei Gewichtsware pro kg, sonst pro Stück/Paket
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS charge_artikel (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id          INTEGER NOT NULL REFERENCES chargen (id) ON DELETE CASCADE,
  produkt_id         INTEGER NOT NULL REFERENCES produkte (id),
  preis_cent         INTEGER NOT NULL CHECK (preis_cent >= 0),
  kontingent         INTEGER NOT NULL CHECK (kontingent >= 0),
  max_pro_bestellung INTEGER CHECK (max_pro_bestellung IS NULL OR max_pro_bestellung > 0),
  reihenfolge        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (charge_id, produkt_id)
);


-- ------------------------------------------------------------
-- Termine einer Charge: Abholfenster am Hof und Liefertermine
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS termine (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id INTEGER NOT NULL REFERENCES chargen (id) ON DELETE CASCADE,
  art       TEXT    NOT NULL CHECK (art IN ('abholung', 'lieferung')),
  datum     TEXT    NOT NULL,
  von       TEXT,             -- 'HH:MM'
  bis       TEXT,
  hinweis   TEXT
);

CREATE INDEX IF NOT EXISTS idx_termine_charge ON termine (charge_id);


-- ------------------------------------------------------------
-- Liefergebiet: belieferte Orte mit Liefergebühr
-- gratis_ab_cent: ab diesem Bestellwert entfällt die Gebühr (NULL = nie)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS liefergebiet (
  plz                TEXT    NOT NULL,
  ort                TEXT    NOT NULL,
  liefergebuehr_cent INTEGER NOT NULL DEFAULT 0 CHECK (liefergebuehr_cent >= 0),
  gratis_ab_cent     INTEGER CHECK (gratis_ab_cent IS NULL OR gratis_ab_cent >= 0),
  tour_reihenfolge   INTEGER NOT NULL DEFAULT 0,   -- Sortierung der Liefertour
  PRIMARY KEY (plz, ort)
);


-- ------------------------------------------------------------
-- Nummernkreis für Bestellnummern: <Jahr>-<laufende Nummer>, z. B. 2026-001
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nummernkreis (
  jahr    INTEGER PRIMARY KEY,
  letzte  INTEGER NOT NULL DEFAULT 0
);


-- ------------------------------------------------------------
-- Bestellungen
-- status:  'vorgemerkt' – zählt vom Kontingent ab
--          'warteliste' – zählt nicht, rückt bei freier Menge nach
--          'storniert'
-- Übergabe und Zahlung sind eigene Felder (übergeben, aber noch nicht
-- überwiesen ist ein normaler Zustand).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bestellungen (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  nummer              TEXT    NOT NULL UNIQUE,
  charge_id           INTEGER NOT NULL REFERENCES chargen (id),
  kunde_id            INTEGER NOT NULL REFERENCES kunden (id),
  quelle              TEXT    NOT NULL DEFAULT 'web'
                      CHECK (quelle IN ('web', 'whatsapp', 'telefon', 'persoenlich')),
  status              TEXT    NOT NULL DEFAULT 'vorgemerkt'
                      CHECK (status IN ('vorgemerkt', 'warteliste', 'storniert')),
  termin_id           INTEGER REFERENCES termine (id),
  lieferadresse       TEXT,             -- Kopie zum Bestellzeitpunkt
  zahlart             TEXT    NOT NULL DEFAULT 'bar'
                      CHECK (zahlart IN ('bar', 'ueberweisung')),
  uebergeben_am       TEXT,
  bezahlt_am          TEXT,
  bezahlt_art         TEXT    CHECK (bezahlt_art IS NULL OR bezahlt_art IN ('bar', 'ueberweisung')),
  bezahlt_betrag_cent INTEGER,
  liefergebuehr_cent  INTEGER NOT NULL DEFAULT 0 CHECK (liefergebuehr_cent >= 0),
  anmerkung           TEXT,             -- vom Kunden
  interne_notiz       TEXT,             -- nur Verwaltung
  erstellt_am         TEXT    NOT NULL DEFAULT (datetime('now')),
  geaendert_am        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bestellungen_charge ON bestellungen (charge_id, status);
CREATE INDEX IF NOT EXISTS idx_bestellungen_kunde  ON bestellungen (kunde_id);


-- ------------------------------------------------------------
-- Positionen einer Bestellung
-- einzelpreis_cent wird beim Bestellen aus charge_artikel kopiert und
-- bleibt danach fest (spätere Preisänderungen betreffen sie nicht).
-- gewicht_g: Gesamtgewicht der Position, erst nach dem Wiegen.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bestell_positionen (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  bestellung_id     INTEGER NOT NULL REFERENCES bestellungen (id) ON DELETE CASCADE,
  charge_artikel_id INTEGER NOT NULL REFERENCES charge_artikel (id),
  menge             INTEGER NOT NULL CHECK (menge > 0),
  einzelpreis_cent  INTEGER NOT NULL CHECK (einzelpreis_cent >= 0),
  gewicht_g         INTEGER CHECK (gewicht_g IS NULL OR gewicht_g > 0)
);

CREATE INDEX IF NOT EXISTS idx_positionen_bestellung ON bestell_positionen (bestellung_id);
CREATE INDEX IF NOT EXISTS idx_positionen_artikel    ON bestell_positionen (charge_artikel_id);


-- ------------------------------------------------------------
-- ANSICHTEN (Views) – Berechnungen an einer Stelle
-- Gleiche Rechnung wie positionBetrag() in functions/_lib/hofladen.js.
-- ------------------------------------------------------------

-- Betrag je Position; Gewichtsware ohne Gewicht wird mit dem mittleren
-- Richtgewicht geschätzt (geschaetzt = 1).
CREATE VIEW IF NOT EXISTS v_positionen AS
SELECT
  p.id,
  p.bestellung_id,
  p.charge_artikel_id,
  ca.charge_id,
  pr.id   AS produkt_id,
  pr.name AS produkt_name,
  pr.art,
  p.menge,
  p.einzelpreis_cent,
  p.gewicht_g,
  CASE
    WHEN pr.art <> 'gewicht' THEN p.einzelpreis_cent * p.menge
    WHEN p.gewicht_g IS NOT NULL THEN CAST(ROUND(p.einzelpreis_cent * p.gewicht_g / 1000.0) AS INTEGER)
    ELSE CAST(ROUND(p.einzelpreis_cent * p.menge
                    * (pr.richtgewicht_von_g + pr.richtgewicht_bis_g) / 2000.0) AS INTEGER)
  END AS betrag_cent,
  CASE WHEN pr.art = 'gewicht' AND p.gewicht_g IS NULL THEN 1 ELSE 0 END AS geschaetzt
FROM bestell_positionen p
JOIN charge_artikel ca ON ca.id = p.charge_artikel_id
JOIN produkte pr       ON pr.id = ca.produkt_id;

-- Bestand je Artikel einer Charge: nur vorgemerkte Bestellungen zählen.
CREATE VIEW IF NOT EXISTS v_bestand AS
SELECT
  ca.id AS charge_artikel_id,
  ca.charge_id,
  ca.produkt_id,
  ca.kontingent,
  COALESCE(SUM(CASE WHEN b.status = 'vorgemerkt' THEN p.menge END), 0) AS bestellt,
  ca.kontingent - COALESCE(SUM(CASE WHEN b.status = 'vorgemerkt' THEN p.menge END), 0) AS frei
FROM charge_artikel ca
LEFT JOIN bestell_positionen p ON p.charge_artikel_id = ca.id
LEFT JOIN bestellungen b       ON b.id = p.bestellung_id
GROUP BY ca.id;

-- Summe je Bestellung (ohne/mit Liefergebühr)
CREATE VIEW IF NOT EXISTS v_bestellsummen AS
SELECT
  b.id AS bestellung_id,
  b.nummer,
  b.charge_id,
  COALESCE(SUM(v.betrag_cent), 0)                        AS waren_cent,
  COALESCE(SUM(v.betrag_cent), 0) + b.liefergebuehr_cent AS gesamt_cent,
  COALESCE(MAX(v.geschaetzt), 0)                         AS geschaetzt
FROM bestellungen b
LEFT JOIN v_positionen v ON v.bestellung_id = b.id
GROUP BY b.id;

-- Vorschlag für eine neue Charge: Preis, Menge und Höchstmenge je Produkt
-- aus der zuletzt angelegten Charge, in der das Produkt vorkam.
CREATE VIEW IF NOT EXISTS v_letzter_preis AS
SELECT
  ca.produkt_id,
  ca.preis_cent,
  ca.kontingent,
  ca.max_pro_bestellung,
  ca.charge_id AS aus_charge_id,
  c.titel      AS aus_charge_titel
FROM charge_artikel ca
JOIN chargen c ON c.id = ca.charge_id
WHERE ca.id = (
  SELECT ca2.id FROM charge_artikel ca2
  JOIN chargen c2 ON c2.id = ca2.charge_id
  WHERE ca2.produkt_id = ca.produkt_id
  ORDER BY c2.erstellt_am DESC, c2.id DESC
  LIMIT 1
);
