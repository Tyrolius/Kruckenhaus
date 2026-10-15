-- ============================================================
-- MIGRATION Oktober 2026: Herkunft und USt-Satz je Produkt
-- (Auswertung für Finanzamt/SVS, Abgleich mit Bertha)
-- ============================================================
-- Nur für eine Datenbank, die schon vor dieser Änderung bestand – und nur
-- EINMAL ausführen (ALTER TABLE lässt sich nicht wiederholen).
--
-- VORHER SICHERN:
--   npx wrangler d1 export kruckenhaus --remote --output=sicherung.sql
--
-- Dann:
--   npx wrangler d1 execute kruckenhaus --remote --file=./migration-2026-10-steuer.sql
--   npx wrangler d1 execute kruckenhaus --remote --file=./schema-hofladen.sql
--
-- schema-hofladen.sql legt danach die Ansichten v_produkte und
-- v_positionen (und v_bestellsummen) mit den neuen Spalten wieder an. Ohne Terminal: die
-- einzeilige Fassung aus README.md (Abschnitt Hofladen) in der D1-Konsole.
--
-- Rein additiv: bestehende Produkte und Positionen bleiben „nicht eingestuft"
-- (NULL), bis Herkunft und Satz in der Verwaltung eingetragen sind.
-- ============================================================

ALTER TABLE produkte ADD COLUMN herkunft TEXT
  CHECK (herkunft IS NULL OR herkunft IN ('urprodukt', 'verarbeitung', 'zukauf'));
ALTER TABLE produkte ADD COLUMN ust_satz REAL
  CHECK (ust_satz IS NULL OR (ust_satz >= 0 AND ust_satz < 100));
ALTER TABLE bestell_positionen ADD COLUMN herkunft TEXT;
ALTER TABLE bestell_positionen ADD COLUMN ust_satz REAL;

-- Ansichten mit den neuen Spalten neu anlegen (macht schema-hofladen.sql)
DROP VIEW IF EXISTS v_produkte;
DROP VIEW IF EXISTS v_bestellsummen;   -- baut auf v_positionen auf
DROP VIEW IF EXISTS v_positionen;
