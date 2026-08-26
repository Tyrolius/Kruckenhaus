# CLAUDE.md – Arbeitsanleitung für dieses Repository

Diese Datei richtet sich an Claude Code. Sie beschreibt, wie dieses Projekt
aufgebaut ist und worauf bei Änderungen zu achten ist.
Ausführliche Betriebs- und Einrichtungsanleitungen stehen in `README.md` –
diese Datei ergänzt sie um das, was beim Programmieren wichtig ist.

## Sprache

- **Antworten, Commit-Messages und PR-Titel: Deutsch.**
- Alle sichtbaren Website-Texte sind Deutsch (`lang="de"`, Region `de-AT`,
  österreichische Schreibweise: „Ferienwohnung", „Anreise", „Ortstaxe").
- Code-Kommentare sind ebenfalls Deutsch – das bitte beibehalten.

## Was das Projekt ist

Website der Ferienwohnung **Hof Kruckenhaus**, Oberberg 70, 6252 Breitenbach
am Inn, Tirol. Zweck: Direktbuchungen ohne Portalgebühren.

- **Statisches HTML/CSS/JS, kein Framework, kein Build-Schritt.** Es gibt
  keine `package.json` im Projektstamm, kein npm-Install, kein Bundling.
  Was im Repository liegt, ist exakt das, was ausgeliefert wird.
- **Hosting: Cloudflare Pages**, Production-Branch `master`,
  Build-Output-Verzeichnis `.` (siehe `wrangler.toml`).
  Jeder Push auf `master` ist nach 1–2 Minuten live.
- **Serverseitig** laufen nur zwei Cloudflare Pages Functions unter
  `functions/api/` (Kontaktformular, Airbnb-Kalender).
- **Datenbank:** Cloudflare D1 (`kruckenhaus`), Binding `DB`.

Wichtig: **Kein Framework einführen, keine Build-Pipeline, keine
npm-Abhängigkeiten fürs Frontend hinzufügen**, ohne ausdrücklichen Auftrag.
Das ist eine bewusste Entscheidung (Wartbarkeit durch Nicht-Entwickler).

## Aufbau

```
*.html                     12 eigenständige Seiten, jede vollständig
                           (Head, Navigation, Footer dupliziert – kein Include)
css/style.css              gesamtes Design, ~3400 Zeilen, nummerierte Abschnitte
js/main.js                 Navigation, Lightbox, Scroll-Effekte, Formular
js/preise-config.js        ALLE Preise zentral (Objekt PREISE)
js/verfuegbarkeit.js       Belegungskalender-Anzeige (ruft /api/availability)
js/slider.js               Hero-Slider (nur index.html)
functions/api/kontakt.js      POST /api/kontakt → D1 + E-Mail via Resend
functions/api/availability.js GET /api/availability → Airbnb-iCal parsen
schema.sql                 D1-Schema (Tabelle „anfragen")
_headers                   Security- und Cache-Header
wrangler.toml              Pages-Konfiguration inkl. D1-Binding (nicht löschen!)
sitemap.xml robots.txt llms.txt   SEO / KI-Auffindbarkeit
fonts/                     lokal gehostete Schriften (DSGVO – nicht auslagern!)
images/                    Fotos; werden per GitHub Action auto-optimiert
.github/workflows/optimize-images.yml + .github/scripts/optimize-images.js
```

## Harte Regeln (nicht ohne Rückfrage brechen)

1. **Keine Cookies, kein Tracking, keine externen Ressourcen.**
   Kein Google Analytics, kein Meta-Pixel, keine Google Fonts vom
   Google-Server, keine CDN-Skripte. Deshalb gibt es bewusst keinen
   Cookie-Banner. Schriften bleiben in `fonts/`, Karten werden nicht als
   Google-Maps-iFrame eingebettet.
2. **Geheimnisse gehören nie in den Code.** `AIRBNB_ICAL_URL` und
   `RESEND_API_KEY` sind Cloudflare-Secrets. Die iCal-URL ist ein Geheimnis
   und darf auch nicht in Kommentaren, Beispielen oder Commits auftauchen.
3. **Rechtstexte** (`impressum.html`, `datenschutz.html`) inhaltlich nur auf
   ausdrücklichen Auftrag ändern. Formulierungen dort sind abgestimmt.
4. **Keine erfundenen Gästebewertungen, Fotos oder Fakten.** Platzhalter
   bleiben als Platzhalter erkennbar, bis echte Inhalte geliefert werden.
5. **`wrangler.toml`, `_headers`, `fonts/` nicht löschen oder umbenennen.**
6. **Bilder nicht manuell verkleinern** – die GitHub Action erledigt das
   (max. ~1600 px, ~300 KB; `images/logo.png` ist ausgenommen).

## Änderungen, die mehrere Dateien betreffen

Weil die Seiten eigenständig sind, ziehen viele Änderungen Folgeänderungen
nach sich. Vor dem Abschließen jeweils prüfen:

| Änderung | Überall anpassen |
|---|---|
| **Preis** | `js/preise-config.js` (Quelle der Wahrheit) **und** die hartkodierten „ab 120 €"-Stellen in `index.html` (Text, `priceRange`, `makesOffer`-JSON-LD), `ferienwohnung.html`, `preise.html` (og:description), `workation.html` (og:description) **und** `llms.txt` |
| **Telefon / E-Mail** | alle `.html` (E-Mail steht in 11 Dateien) und `js/main.js` |
| **Navigationspunkt** | in *jeder* `.html` zweimal: `.nav-menu` (Desktop) und `.nav-overlay` (Mobile); ggf. zusätzlich `.bottom-tab-bar`; dazu `sitemap.xml` |
| **FAQ-Text** | `kontakt.html` **zweimal**: sichtbar als `<details>` und im FAQPage-JSON-LD im `<head>` – beide identisch halten |
| **Footer / Copyright-Jahr** | alle `.html` |
| **Neue Seite** | Datei anlegen, Navigation in allen Seiten ergänzen, `sitemap.xml`, ggf. `llms.txt`, Canonical/OG-Tags im `<head>` setzen |

Für solche Durchgänge ruhig `grep -rn` über alle `*.html` laufen lassen und
danach gegenprüfen, dass keine Fundstelle übrig blieb.

## Konventionen

**HTML**
- 2 Leerzeichen Einrückung, Attribute in doppelten Anführungszeichen,
  selbstschließende Void-Elemente im `<head>` mit ` />`.
- Jede Seite hat im `<head>`: `description`, `keywords`, `author`, `robots`,
  Open-Graph-Tags, `canonical`, `hreflang`, `title`. Bei neuen Seiten dieses
  Muster von einer bestehenden Seite übernehmen.
- Strukturierte Daten (JSON-LD) gehören in den `<head>`; `index.html` trägt
  `LodgingBusiness`, `kontakt.html` die `FAQPage`.
- Barrierefreiheit: `role`/`aria-label` an Navigationen, `aria-hidden="true"`
  an dekorativen SVGs, `aria-current="page"` im Breadcrumb – so weiterführen.
- Bilder: `loading="lazy"` und `decoding="async"`, **außer** beim
  Above-the-fold-Bild der Startseite. Immer sinnvolles `alt` setzen.
- Fehlende Fotos sind als Kommentar markiert, inklusive Wunschmotiv:
  `<!-- TODO: Alpakas auf Weide vor Bergkulisse (1920x1080) -->`.
  Dieses Format beibehalten, wenn neue Platzhalter nötig sind.

**CSS**
- Alles in `css/style.css`, **mobile-first**, Breakpoints 768 px und 1024 px.
- Nummerierte Abschnitte mit Banner-Kommentar
  (`/* ===== 19. PREISE & BUCHUNG ===== */`). Neue Blöcke am Ende ergänzen
  und mit passendem Banner versehen; die Nummerierung fortführen.
- Farben, Schriften, Abstände, Schatten, Übergänge **nur** über die Custom
  Properties aus `:root` (Abschnitt 2) verwenden – keine neuen Hex-Werte
  streuen. Palette: `--color-primary` #2F5848, `--color-terracotta` #964F33,
  `--color-green` #79C0BC, `--color-beige` #F0E6DD.
- Klassennamen sind deutsch/beschreibend und in Kebab-Case
  (`.tiersteckbrief`, `.direkt-buchen-banner`).

**JavaScript**
- Vanilla ES2020+, `'use strict';`, keine Abhängigkeiten.
- Aufbau wie `js/main.js`: `init…()`-Funktionen, die im
  `DOMContentLoaded`-Handler registriert werden; nummerierte
  Abschnittskommentare.
- Defensiv gegen fehlende Elemente prüfen (`if (!el) return;`), weil dasselbe
  Skript auf allen Seiten läuft.
- **Kein `localStorage`, `sessionStorage` oder Cookie-Setzen** (siehe Regel 1).

**Cloudflare Functions**
- Datei-Pfad = Route (`functions/api/kontakt.js` → `/api/kontakt`).
- Kopfkommentar mit Route, Ablauf und benötigten Bindings/Secrets pflegen.
- Fehlende Secrets dürfen nicht zum harten Fehler führen: fehlt
  `RESEND_API_KEY`, wird die Anfrage trotzdem in D1 gespeichert. Dieses
  „graceful degradation"-Muster beibehalten.
- Nutzereingaben vor dem Einsetzen in E-Mail-HTML escapen
  (`escapeHtml`), D1-Zugriffe nur über gebundene Prepared Statements.

## Testen

Es gibt keine automatisierten Tests und keinen Linter.

- **Mit Functions:** `npx wrangler pages dev .` (Node nötig) – nur so laufen
  Kontaktformular und Kalender lokal.
- **Nur Seiten:** `python3 -m http.server` genügt für reine Text-/CSS-Änderungen.
- Nach jeder sichtbaren Änderung mindestens gedanklich, besser im Browser
  gegen **Mobil (375 px)** und Desktop prüfen – der Hauptteil der Gäste kommt
  vom Handy.
- HTML-Änderungen selbst gegenlesen: schließende Tags, valides JSON-LD
  (JSON-Syntax!), keine kaputten relativen Links.

## D1

- Schemaänderung: `schema.sql` anpassen, dann
  `npx wrangler d1 execute kruckenhaus --remote --file=./schema.sql`.
- Die Datenbank enthält neben `anfragen` ein vorbereitetes, **noch nicht
  angebundenes** Buchungsmodell (`einheiten`, `preisperioden`, `buchungen`,
  `naechte`). Nicht löschen, nicht „aufräumen" – Details im README.

## Git

- Entwicklung **immer auf dem zugewiesenen Feature-Branch**, nie direkt auf
  `master` (Push auf `master` geht sofort live).
- Commit-Messages auf Deutsch, im Imperativ, eine Zeile Betreff, bei Bedarf
  Fließtext darunter. Keine Modell- oder Werkzeugnamen in Commits, PR-Titeln
  oder Code-Kommentaren.
- Pull Request nur anlegen, wenn ausdrücklich gewünscht.

## Offene Punkte (Stand der Checkliste im README)

- Echte Fotos fehlen; überall `TODO:`-Platzhalter.
- Gästestimmen auf der Startseite sind teils Platzhalter.
- Social-Media-Links im Footer zeigen auf `#`.
- Alpaka-Namen (Noblesse, Bellissima, Marée) sind noch nicht eingesetzt.

Wenn eine Anfrage einen dieser Punkte berührt, das gleich miterledigen bzw.
kurz darauf hinweisen.
