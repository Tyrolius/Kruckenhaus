-- ============================================================
-- D1-SCHEMA – Kruckenhaus
-- ============================================================
-- Tabelle für die Kontakt-/Buchungsanfragen aus dem Formular
-- (functions/api/kontakt.js).
--
-- Anlegen/aktualisieren:
--   wrangler d1 execute kruckenhaus --remote --file=./schema.sql
--
-- HINWEIS: Diese Datei deckt nur die Tabelle "anfragen" ab. Die Datenbank
-- enthält zusätzlich ein (noch nicht mit der Website verbundenes) Buchungs-
-- modell: einheiten, preisperioden, buchungen, naechte. Siehe README.md,
-- Abschnitt "Datenbank: Buchungsmodell".
-- ============================================================

CREATE TABLE IF NOT EXISTS anfragen (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  telefon     TEXT,
  anreise     TEXT,
  abreise     TEXT,
  personen    TEXT,
  nachricht   TEXT NOT NULL,
  ip          TEXT,   -- wird seit 09/2026 nicht mehr befüllt (Datenschutz)
  user_agent  TEXT    -- wird seit 09/2026 nicht mehr befüllt (Datenschutz)
);

CREATE INDEX IF NOT EXISTS idx_anfragen_erstellt_am ON anfragen (erstellt_am);
