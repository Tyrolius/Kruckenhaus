-- ============================================================
-- D1-SCHEMA – Freilandeier (freilandeier.html)
-- ============================================================
-- Anmeldungen als Eierkunde (Formular „Kunde werden") und die kurzen
-- Einträge „Aktuelles vom Stall". Beide pflegt die Verwaltung
-- (verwaltung/eier.html). Die eigentliche Kundenverwaltung läuft in
-- Bertha – angenommene Anmeldungen werden dort von Hand angelegt
-- (CSV-Export der Verwaltung), es gibt keine automatische Übergabe.
--
-- Anlegen/aktualisieren (darf mehrfach ausgeführt werden):
--   npx wrangler d1 execute kruckenhaus --remote --file=./schema-eier.sql
--   npx wrangler d1 execute kruckenhaus-test --remote --file=./schema-eier.sql
--
-- Bewusst OHNE IP-Adresse und Browserkennung (Datenschutzerklärung,
-- Abschnitt „Anmeldung als Eierkunde"). Spam-Schutz ist der Honeypot.
-- Zeitpunkte als datetime('now') (UTC), Datum als 'YYYY-MM-DD'.
-- ============================================================

CREATE TABLE IF NOT EXISTS eier_anmeldungen (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  erstellt_am        TEXT    NOT NULL DEFAULT (datetime('now')),
  geaendert_am       TEXT,
  status             TEXT    NOT NULL DEFAULT 'neu'
                     CHECK (status IN ('neu', 'warteliste', 'angenommen', 'abgelehnt')),
  name               TEXT    NOT NULL,
  strasse            TEXT    NOT NULL,   -- Straße und Hausnummer
  plz                TEXT    NOT NULL,
  ort                TEXT    NOT NULL,
  telefon            TEXT    NOT NULL,
  email              TEXT    NOT NULL,
  schachteln         INTEGER NOT NULL CHECK (schachteln BETWEEN 1 AND 10),
  rhythmus           TEXT    NOT NULL CHECK (rhythmus IN ('woechentlich', '14-taegig')),
  abstellort         TEXT    NOT NULL,   -- Schlüssel, siehe ABSTELLORTE in functions/_lib/eier.js
  abstellort_hinweis TEXT,
  herkunft           TEXT,               -- „Wie habt ihr von uns erfahren?", Schlüssel aus HERKUNFT
  empfohlen_von      TEXT,               -- nur bei Empfehlung
  neuigkeiten        INTEGER NOT NULL DEFAULT 0 CHECK (neuigkeiten IN (0, 1)),
  neuigkeiten_seit   TEXT,               -- Zeitpunkt der Einwilligung (Nachweis)
  datenschutz_am     TEXT    NOT NULL,   -- Zeitpunkt, an dem der Datenschutzhinweis bestätigt wurde
  notiz              TEXT                -- intern, sieht der Interessent nie
);

CREATE INDEX IF NOT EXISTS idx_eier_anmeldungen_status ON eier_anmeldungen (status, erstellt_am);
CREATE INDEX IF NOT EXISTS idx_eier_anmeldungen_email  ON eier_anmeldungen (email);

-- „Aktuelles vom Stall": kurze, datierte Einträge auf freilandeier.html
CREATE TABLE IF NOT EXISTS stall_neuigkeiten (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  datum        TEXT    NOT NULL,           -- 'YYYY-MM-DD', danach wird sortiert
  titel        TEXT    NOT NULL,
  text         TEXT    NOT NULL,
  sichtbar     INTEGER NOT NULL DEFAULT 1 CHECK (sichtbar IN (0, 1)),
  erstellt_am  TEXT    NOT NULL DEFAULT (datetime('now')),
  geaendert_am TEXT
);

CREATE INDEX IF NOT EXISTS idx_stall_neuigkeiten_datum ON stall_neuigkeiten (sichtbar, datum);
