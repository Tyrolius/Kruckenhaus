-- ============================================================
-- PRODUKTKATALOG UND LIEFERGEBIET – Hofladen-Vorbestellung (Erstbefüllung)
-- ============================================================
-- Stand September 2026, Angaben von Kathrin und Florian.
-- Voraussetzung: schema-hofladen.sql wurde ausgeführt.
--
-- Einspielen (darf mehrfach ausgeführt werden – vorhandene Produkte
-- mit gleichem Namen werden übersprungen, nicht überschrieben):
--   npx wrangler d1 execute kruckenhaus --remote --file=./hofladen-produkte.sql
--
-- startpreis_cent ist nur der Vorschlag für die erste Charge. Der Preis,
-- der gilt, wird je Charge in der Verwaltung festgelegt; danach wird der
-- Preis der letzten Charge vorgeschlagen.
-- Beträge in Cent, Richtgewichte in Gramm.
--
-- Noch offen (später in der Verwaltung ergänzen):
--   TODO: Pflichtangaben und Allergene der Eiernudeln laut Etikett
--         (Zutaten, glutenhaltiges Getreide, Ei)
--   TODO: Inhalt der Rindfleischpakete (welche Teile)
--   TODO: Liefergebühr / gratis ab – derzeit 0 € (kostenlos) eingetragen
--   TODO: Sorten der Alpakaseife (derzeit ein Sammelartikel)
--   TODO: Gans – Preis/kg und Richtgewicht fehlen noch; wird meist über
--         Voranmeldungen verkauft
--   Richtgewicht „Masthuhn halbiert" = halbes Richtgewicht des ganzen
--   Huhns (0,9–1,2 kg), bestätigt.
-- ============================================================


-- --- Fleisch ---
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Masthuhn ganz', 'gewicht', 'fleisch', 1800, 2400, 1200, 10, 'Ganzes Masthuhn. Preis pro kg, abgerechnet nach tatsächlichem Gewicht.'
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Masthuhn ganz');
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Masthuhn halbiert', 'gewicht', 'fleisch', 900, 1200, 1200, 20, 'Halbes Masthuhn, bestellt wird je Hälfte. Preis pro kg, abgerechnet nach tatsächlichem Gewicht.'
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Masthuhn halbiert');
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Pute ganz, zerlegt', 'gewicht', 'fleisch', 6000, 9000, 1750, 30, 'Ganze Pute, zerlegt. Preis pro kg, abgerechnet nach tatsächlichem Gewicht.'
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Pute ganz, zerlegt');
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Rindfleischpaket 5 kg', 'paket', 'fleisch', NULL, NULL, 7500, 40, '5 kg gemischtes Rindfleisch zum Fixpreis (15 €/kg).'
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Rindfleischpaket 5 kg');
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Rindfleischpaket 10 kg', 'paket', 'fleisch', NULL, NULL, 14000, 50, '10 kg gemischtes Rindfleisch zum Fixpreis (14 €/kg).'
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Rindfleischpaket 10 kg');

-- --- Eiernudeln (Sorten nicht immer alle verfügbar – je Charge nur die vorhandenen aufnehmen) ---
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Eiernudeln Spaghetti 500 g', 'stueck', 'nudeln', NULL, NULL, 400, 110, NULL
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Eiernudeln Spaghetti 500 g');
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Eiernudeln Hörnchen 500 g', 'stueck', 'nudeln', NULL, NULL, 400, 120, NULL
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Eiernudeln Hörnchen 500 g');
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Eiernudeln Spirelli 500 g', 'stueck', 'nudeln', NULL, NULL, 400, 130, NULL
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Eiernudeln Spirelli 500 g');
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Eiernudeln Rotunde 500 g', 'stueck', 'nudeln', NULL, NULL, 400, 140, NULL
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Eiernudeln Rotunde 500 g');
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Eiernudeln Pappardelle 500 g', 'stueck', 'nudeln', NULL, NULL, 400, 150, NULL
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Eiernudeln Pappardelle 500 g');
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Eiernudeln Bandnudeln 500 g', 'stueck', 'nudeln', NULL, NULL, 400, 160, NULL
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Eiernudeln Bandnudeln 500 g');

-- --- Honig ---
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Raphaels Wald- & Blütenhonig 500 g', 'stueck', 'honig', NULL, NULL, 1200, 210, 'Wald- und Blütenhonig von unserem Sohn Raphael.'
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Raphaels Wald- & Blütenhonig 500 g');

-- --- Seife ---
INSERT INTO produkte (name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent, reihenfolge, beschreibung)
SELECT 'Alpakaseife', 'stueck', 'seife', NULL, NULL, 450, 310, 'Seife mit Alpakamilch, verschiedene Sorten.'
WHERE NOT EXISTS (SELECT 1 FROM produkte WHERE name = 'Alpakaseife');


-- ------------------------------------------------------------
-- LIEFERGEBIET (Postleitzahlen laut Kathrin und Florian)
-- Andere Orte: nur Abholung am Hof. tour_reihenfolge = Vorschlag für die
-- Sortierung der Liefertour, in der Verwaltung änderbar.
-- ------------------------------------------------------------
INSERT OR IGNORE INTO liefergebiet (plz, ort, liefergebuehr_cent, gratis_ab_cent, tour_reihenfolge) VALUES
  ('6252', 'Breitenbach am Inn', 0, NULL, 10),
  ('6233', 'Kramsach',           0, NULL, 20),
  ('6230', 'Brixlegg',           0, NULL, 30),
  ('6250', 'Kundl',              0, NULL, 40);
