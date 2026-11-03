-- ============================================================
-- MIGRATION November 2026: Gasthäuser und große Mengen
--   1. Einzelgewichte je Stück (Lieferschein mit jedem Stück, z. B. 15 Gänse;
--      getippte Gewichte überstehen bei der Übergabe ein Neuladen der Seite)
--   2. Gemerkte Preise je Kunde und Produkt (Gasthaus-Preis)
-- ============================================================
-- Nur für eine Datenbank, die schon vor dieser Änderung bestand – und nur
-- EINMAL ausführen (ALTER TABLE lässt sich nicht wiederholen).
--
-- VORHER SICHERN:
--   npx wrangler d1 export kruckenhaus --remote --output=sicherung.sql
--
-- Dann:
--   npx wrangler d1 execute kruckenhaus --remote --file=./migration-2026-11-gasthaus.sql
--
-- In der D1-Console (Dashboard) genügt diese eine Zeile:
--   ALTER TABLE bestell_positionen ADD COLUMN stueckgewichte TEXT; CREATE TABLE IF NOT EXISTS kunden_preise (kunde_id INTEGER NOT NULL REFERENCES kunden (id) ON DELETE CASCADE, produkt_id INTEGER NOT NULL REFERENCES produkte (id), preis_cent INTEGER NOT NULL CHECK (preis_cent >= 0), geaendert_am TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (kunde_id, produkt_id));
--
-- Rein additiv. Ohne diese Änderung läuft die Verwaltung wie bisher weiter
-- (nur ohne Einzelgewichte und ohne gemerkte Preise).
-- Die Vorschau-Datenbank kruckenhaus-test bitte ebenso ergänzen.
-- ============================================================

ALTER TABLE bestell_positionen ADD COLUMN stueckgewichte TEXT;

CREATE TABLE IF NOT EXISTS kunden_preise (
  kunde_id     INTEGER NOT NULL REFERENCES kunden (id) ON DELETE CASCADE,
  produkt_id   INTEGER NOT NULL REFERENCES produkte (id),
  preis_cent   INTEGER NOT NULL CHECK (preis_cent >= 0),
  geaendert_am TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kunde_id, produkt_id)
);
