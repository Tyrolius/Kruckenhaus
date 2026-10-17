-- ============================================================
-- MIGRATION Oktober 2026: weitere Fotos je Produkt (zur Beschreibung)
-- ============================================================
-- Rein additiv und mehrfach ausführbar (nur CREATE … IF NOT EXISTS) –
-- dasselbe steht auch in schema-hofladen.sql.
--
--   npx wrangler d1 execute kruckenhaus --remote --file=./migration-2026-10-fotos.sql
--
-- Ohne Terminal in der D1-Konsole (eine Zeile, ohne Kommentare):
--   CREATE TABLE IF NOT EXISTS produkt_bilder (id INTEGER PRIMARY KEY AUTOINCREMENT, produkt_id INTEGER NOT NULL REFERENCES produkte (id), bild TEXT NOT NULL, reihenfolge INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS idx_produkt_bilder_produkt ON produkt_bilder (produkt_id, reihenfolge);
--
-- Danach ebenso in der Test-Datenbank kruckenhaus-test. Fehlt die Tabelle,
-- laufen Verwaltung und Hofladen-Seite weiter, nur ohne weitere Fotos.
-- ============================================================

CREATE TABLE IF NOT EXISTS produkt_bilder (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  produkt_id  INTEGER NOT NULL REFERENCES produkte (id),
  bild        TEXT    NOT NULL,
  reihenfolge INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_produkt_bilder_produkt ON produkt_bilder (produkt_id, reihenfolge);
