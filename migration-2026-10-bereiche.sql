-- ============================================================
-- MIGRATION Oktober 2026: Bereiche des Sortiments selbst verwalten
-- ============================================================
-- Nur für eine Datenbank, die schon vor dieser Änderung bestand – und nur
-- EINMAL ausführen (ALTER TABLE lässt sich nicht wiederholen). Danach
-- schema-hofladen.sql erneut ausführen: legt die Standard-Bereiche an,
-- ordnet die Produkte zu und erstellt die Ansicht v_produkte.
--
--   npx wrangler d1 execute kruckenhaus --remote --file=./migration-2026-10-bereiche.sql
--   npx wrangler d1 execute kruckenhaus --remote --file=./schema-hofladen.sql
--
-- Rein additiv: bestehende Daten bleiben unverändert.
-- In der Live-Datenbank am 07.10.2026 ausgeführt.
-- ============================================================

CREATE TABLE IF NOT EXISTS bereiche (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  reihenfolge INTEGER NOT NULL DEFAULT 0,
  kennung     TEXT    UNIQUE
);

ALTER TABLE produkte ADD COLUMN bereich_id INTEGER REFERENCES bereiche (id);
