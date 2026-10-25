# Preisverwaltung – Umsetzungsplan

Stand: Oktober 2026 · Status: **Entwurf** – klickbare Oberfläche unter
`/verwaltung/preise.html` (Beispielmodus, speichert nichts), Datenbank und
Schnittstellen noch nicht umgesetzt.

> Kurzfassung: Florian und Kathrin ändern Preise, Mindestnächte, Endreinigung,
> Ortstaxe, Rabatte, Zahlungs- und Stornobedingungen in einem Formular der
> Verwaltung statt in `js/preise-config.js`. Jede Speicherung legt eine neue
> **Preisliste mit „gültig ab“** an. Die Website, der Angebotsrechner und alle
> festen Textstellen (Startseite, Vorschautexte, Angaben für Suchmaschinen,
> `llms.txt`) holen sich die gültige Preisliste automatisch.

---

## 0. Entscheidungen (offen = noch zu klären)

| Frage | Vorschlag |
|---|---|
| Was ist änderbar? | Alles, was heute in `PREISE` steht: Nachtpreis und Mindestnächte je Saison, Endreinigung, Haustier, später Check-out, Ortstaxe, Langzeitrabatt, Anzahlung, Restzahlung, Storno |
| Saison-Zeiträume (z. B. „Juni“) | **änderbar** (Entscheidung 25.10.2026): Tag/Monat-Bereiche je Saison plus Text für die Preisseite. Das Jahr muss lückenlos und ohne Überschneidung abgedeckt sein; Ostern bleibt automatisch |
| Bedienung | **am PC** – keine eigene Handy-Ansicht nötig |
| Preisänderung für das nächste Jahr | Preisliste mit **„gültig ab“**. Die Website zeigt ab diesem Tag die neuen Preise; der Angebotsrechner rechnet schon vorher mit dem Preis, der **am Anreisetag** gilt |
| Rückgängig machen | Jede Preisliste bleibt gespeichert. „Wiederherstellen“ legt eine Kopie einer früheren Liste als neue an |
| Was, wenn die Datenbank nicht erreichbar ist? | Die Website fällt auf die Werte in `js/preise-config.js` zurück. Die Datei bleibt deshalb bestehen |
| Airbnb | bleibt **Handarbeit**. Seit 25.10.2026 gibt es keine Bestpreis-Zusage mehr, Website und Airbnb dürfen abweichen – daher kein Pflicht-Haken beim Speichern |
| Mindestbetrag | je Saison `mindestBetrag` (Nächte + Endreinigung, ohne Ortstaxe), maßgeblich ist die Saison der Anreise; derzeit 1.000 € in Winter, Sommer, Weihnachten & Silvester |

---

## 1. Nachteile gegenüber der heutigen Lösung

1. **Die festen Textstellen brauchen einen Zwischenschritt beim Ausliefern.**
   „ab 125 €“ auf der Startseite, die Vorschautexte (og:description), die
   Preisangaben für Suchmaschinen (JSON-LD) und `llms.txt` werden von Google,
   WhatsApp-Vorschauen und KI-Diensten gelesen, **ohne** JavaScript auszuführen.
   Damit sie stimmen, ersetzt eine Cloudflare-Function (`functions/_middleware.js`)
   die Preise beim Ausliefern jeder Seite. Folgen:
   - jede Seitenanfrage läuft durch eine Function mit einer D1-Abfrage
     (kurz zwischengespeichert, ein paar Millisekunden; das Gratis-Kontingent von
     Cloudflare reicht bei Weitem),
   - ein Fehler in dieser Function kann im schlimmsten Fall die ganze Website
     betreffen. Deshalb: bei jedem Fehler die Seite unverändert ausliefern.
2. **Ein Tippfehler ist sofort online.** 1.250 statt 125 € steht nach dem
   Speichern auf der Website. Gegenmittel: Plausibilitätsprüfungen, Liste der
   Änderungen vor dem Speichern, Bestätigung, Verlauf zum Zurückholen.
3. **Mehr Technik, die gepflegt werden will:** neue Tabelle, zwei
   Schnittstellen, die Function, Tests. Heute ist es eine Datei.
4. **Zwei Quellen:** Datenbank (gilt) und `preise-config.js` (nur Notfall). Wer
   künftig die Datei ändert, ändert damit nichts auf der Website, solange die
   Datenbank erreichbar ist. Steht als Hinweis oben in der Datei.
5. **Airbnb wird nicht automatisch angepasst.** Das geht über die
   Airbnb-Schnittstelle nur für Partnerfirmen.

---

## 2. Datenmodell

Neue Tabelle in `schema.sql` (die vorhandene Tabelle `preisperioden` passt nicht:
sie kennt nur Zeiträume mit festem Datum und keinen Rest der Preisliste):

```sql
CREATE TABLE IF NOT EXISTS preislisten (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  gueltig_ab  TEXT NOT NULL,              -- YYYY-MM-DD
  daten       TEXT NOT NULL,              -- JSON, gleicher Aufbau wie PREISE in js/preise-config.js
  notiz       TEXT,                       -- z. B. „Preise 2027“
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
  erstellt_von TEXT                       -- Access-E-Mail, nur intern sichtbar
);
CREATE INDEX IF NOT EXISTS idx_preislisten_gueltig ON preislisten (gueltig_ab, id);
```

Gültige Liste an einem Tag = die mit dem spätesten `gueltig_ab` ≤ Tag (bei
gleichem Datum die neueste).

---

## 3. Schnittstellen

| Route | Zugang | Zweck |
|---|---|---|
| `GET /api/preise` | öffentlich | gültige Liste + angekündigte künftige Listen (nur Preisdaten, keine Notizen, kein `erstellt_von`), 5 Min. Cache |
| `GET /api/verwaltung/preise` | Access + `zugang.js` | alle Listen mit Verlauf |
| `POST /api/verwaltung/preise` | Access + `zugang.js` | neue Liste speichern; Prüfung wie im Formular, serverseitig noch einmal |

---

## 4. Auslieferung der Preise

- **Sichtbare Stellen** (`data-preis`): `js/preise-config.js` lädt beim Start
  `/api/preise` und füllt wie heute; ohne Antwort bleiben die Werte der Datei.
  Die drei „ab 125 €“-Stellen in `index.html` und `ferienwohnung.html` bekommen
  ebenfalls `data-preis`.
- **Feste Stellen** (`<meta>`, JSON-LD, `llms.txt`): `functions/_middleware.js`
  ersetzt sie mit `HTMLRewriter` beim Ausliefern. Gekennzeichnet über
  `data-preis-vorlage` bzw. `id="preise-jsonld"`.
- **Angebotsrechner:** nimmt die Liste, die am Anreisetag gilt.

---

## 5. Phasen

| Phase | Inhalt | Stand |
|---|---|---|
| **P0 – Entwurf** | klickbare Oberfläche `verwaltung/preise.html` im Beispielmodus, Prüfungen, Änderungsliste, Vorschau, änderbare Saison-Zeiträume mit Abdeckungsprüfung | **erledigt** |
| **P1 – Speichern** | Tabelle `preislisten`, `GET/POST /api/verwaltung/preise`, Verlauf und Wiederherstellen im Formular | offen |
| **P2 – Website liest mit** | `GET /api/preise`, `preise-config.js` lädt nach, `data-preis` an den „ab“-Stellen, Angebotsrechner nach Anreisetag | offen |
| **P3 – feste Stellen** | `_middleware.js` mit HTMLRewriter für Meta, JSON-LD, `llms.txt`; Tests; Fallback bei Fehlern | offen |

Nach P1 ist das Formular schon nützlich (Verlauf), aber erst nach P2/P3 wirkt
eine Änderung auf der ganzen Website.
