-- ============================================================
-- MIGRATION Oktober 2026: Bestellungen über die Bertha-Schnittstelle
-- (Plan: docs/SCHNITTSTELLE-BERTHA.md, Phase W4)
-- ============================================================
-- Nur für eine Datenbank, in der die Tabelle extern_anfragen schon ohne
-- die Spalte zustimmung angelegt wurde (Phase W3) – und nur EINMAL
-- ausführen. Rein additiv, die Tabelle ist bis dahin leer.
--
-- In der D1-Console (eine Zeile, ohne Kommentare):
--   ALTER TABLE extern_anfragen ADD COLUMN zustimmung TEXT; CREATE INDEX IF NOT EXISTS idx_extern_anfragen_bestellung ON extern_anfragen (bestellung_id);
-- ============================================================

ALTER TABLE extern_anfragen ADD COLUMN zustimmung TEXT;
CREATE INDEX IF NOT EXISTS idx_extern_anfragen_bestellung ON extern_anfragen (bestellung_id);
