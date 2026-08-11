-- ============================================================
-- D1-SCHEMA – Kruckenhaus
-- ============================================================
-- Tabelle für die Kontakt-/Buchungsanfragen aus dem Formular
-- (functions/api/kontakt.js).
--
-- Anlegen/aktualisieren:
--   wrangler d1 execute kruckenhaus --remote --file=./schema.sql
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
  ip          TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_anfragen_erstellt_am ON anfragen (erstellt_am);
