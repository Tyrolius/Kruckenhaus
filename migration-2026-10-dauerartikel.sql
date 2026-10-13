-- ============================================================
-- MIGRATION Oktober 2026: Dauerartikel (Plan: docs/SCHNITTSTELLE-BERTHA.md,
-- Abschnitt 2.1–2.3, Phase W1)
-- ============================================================
-- Nur für eine Datenbank, die schon vor dieser Änderung bestand – und nur
-- EINMAL ausführen (ALTER TABLE lässt sich nicht wiederholen).
--
-- VORHER SICHERN:
--   npx wrangler d1 export kruckenhaus --remote --output=sicherung.sql
--
-- Dann:
--   npx wrangler d1 execute kruckenhaus --remote --file=./migration-2026-10-dauerartikel.sql
--   npx wrangler d1 execute kruckenhaus --remote --file=./schema-hofladen.sql
--
-- schema-hofladen.sql legt danach die Ansichten v_produkte und
-- v_letzter_preis neu an und erstellt den Index für die ständige Runde
-- „Dauersortiment". Die Runde selbst entsteht in der Verwaltung, sobald
-- das erste Produkt als Dauerartikel gespeichert wird.
--
-- Rein additiv: bestehende Produkte bleiben 'runde', bestehende
-- Bestellrunden bleiben 'runde' – an ihnen ändert sich nichts.
-- ============================================================

-- Produkte: Bestellrunde oder Dauerartikel
ALTER TABLE produkte ADD COLUMN verkaufsart TEXT NOT NULL DEFAULT 'runde'
  CHECK (verkaufsart IN ('runde', 'dauer'));
ALTER TABLE produkte ADD COLUMN dauerpreis_cent INTEGER
  CHECK (dauerpreis_cent IS NULL OR dauerpreis_cent >= 0);
ALTER TABLE produkte ADD COLUMN verfuegbar INTEGER NOT NULL DEFAULT 1 CHECK (verfuegbar IN (0, 1));
ALTER TABLE produkte ADD COLUMN im_portal INTEGER NOT NULL DEFAULT 1 CHECK (im_portal IN (0, 1));
-- ALTER TABLE erlaubt keinen Standardwert datetime('now') – daher einmal setzen
ALTER TABLE produkte ADD COLUMN geaendert_am TEXT;
UPDATE produkte SET geaendert_am = datetime('now') WHERE geaendert_am IS NULL;

-- Bestellrunden: normale Runde oder die ständige Runde „Dauersortiment"
ALTER TABLE chargen ADD COLUMN art TEXT NOT NULL DEFAULT 'runde' CHECK (art IN ('runde', 'dauer'));
ALTER TABLE chargen ADD COLUMN im_portal INTEGER NOT NULL DEFAULT 1 CHECK (im_portal IN (0, 1));

-- Ansichten mit den neuen Spalten neu anlegen (macht schema-hofladen.sql)
DROP VIEW IF EXISTS v_produkte;
DROP VIEW IF EXISTS v_letzter_preis;
