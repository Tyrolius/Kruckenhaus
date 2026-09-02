# Umsetzungsplan Website-Überarbeitung

Stand: September 2026.
Arbeitsweise: **eine Sitzung = ein Thema = ein Commit.** Nach jeder Sitzung
`git status` prüfen, lokal ansehen, dann pushen.

Die Grundregeln für jede Sitzung stehen in `CLAUDE.md` und werden von Claude
Code automatisch gelesen – sie müssen nicht mehr mitgegeben werden.

## Lokal ansehen

```
npx wrangler pages dev .     # mit Functions (/api/kontakt, /api/availability)
python3 -m http.server 8080  # reicht zum reinen Anschauen
```

## Überblick

| Sitzung | Thema | Stand |
|---|---|---|
| 1 | Navigation vereinheitlichen | **erledigt** |
| 2 | Lage und Umgebung entflechten | **erledigt** |
| 3 | Schnelle Korrekturen | teilweise – Koordinaten erledigt |
| 4 | Hero vereinfachen | offen |
| 5 | Icons und Typografie | offen |
| 6 | Fotos einbauen | wartet auf Fotos |
| 7 | Inline-Styles konsolidieren | offen |
| 8 | Preise an einer Stelle pflegen | offen |
| 9 | Ton der Texte | offen |
| 10–14 | Englische Fassung unter `/en/` | offen, **erst nach Sitzung 6** |

---

## Sitzung 1 – Navigation vereinheitlichen ✅

Erledigt. Header, Mobil-Overlay und Footer stehen in allen zwölf HTML-Dateien
auf einem Stand, die Hauptnavigation hat neun Punkte inklusive „Lage", die
aktive Markierung stimmt je Seite.

Dabei entfernt: der funktionslose Sprachumschalter `DE | EN` in `lage.html`.
Er kommt in Sitzung 10 als echter Umschalter zurück.

Offen geblieben: die fünf seitenspezifischen Footer-Taglines wurden zugunsten
einer einheitlichen ersetzt. Falls sie gewollt waren, zurückholen.

---

## Sitzung 2 – Lage und Umgebung entflechten ✅

Erledigt nach Variante B. `lage.html` = Anfahrt, Entfernungen, Karte;
`umgebung.html` = Ausflugsziele, Aktivitäten, Skigebiete, Seen. Kein Satz
steht mehr auf beiden Seiten, beide verweisen aufeinander.

**Offene Frage aus dieser Sitzung:** Die beiden Seiten widersprachen sich beim
nächsten Bahnhof – `lage.html` nannte Breitenbach am Inn (3 km, Abholservice),
`umgebung.html` nannte Brixlegg (5 Min. mit dem Auto, Buslinie). Beim Trennen
ist die Brixlegg-Variante entfallen. **Bitte prüfen, welche Angabe stimmt**,
und die Bahn-Beschreibung in `lage.html` entsprechend korrigieren.

Check-in und Parkplatz stehen weiterhin auf `ferienwohnung.html`; `lage.html`
verlinkt dorthin, statt sie ein drittes Mal zu führen.

<details>
<summary>Ursprüngliche Aufgabenstellung</summary>

Warum: Beide Seiten behandeln dasselbe Thema und konkurrieren bei Google
gegeneinander.

**Entschieden: Variante B – trennen.**
`lage.html` = Anfahrt, Distanzen, Karte, Parken, Check-in.
`umgebung.html` = Ausflugsziele, Aktivitäten Sommer/Winter, Skigebiete, Seen.

Prompt:

> `lage.html` und `umgebung.html` überschneiden sich inhaltlich. Trenne sie
> sauber: `lage.html` behandelt ausschließlich Anfahrt, Entfernungen, Karte,
> Parken und Check-in. `umgebung.html` behandelt ausschließlich Ausflugsziele,
> Aktivitäten Sommer/Winter, Skigebiete und Seen.
>
> * Verschiebe Inhalte entsprechend zwischen den beiden Dateien.
> * Passe Titles und Meta-Descriptions an die neue Abgrenzung an.
> * Setze auf jeder der beiden Seiten einen Verweis auf die jeweils andere.
> * Prüfe am Ende, ob interne Links auf verschobene Anker noch stimmen.

Fertig, wenn: kein Absatz mehr auf beiden Seiten steht und die Titles
unterschiedliche Suchanlässe abdecken.

</details>

---

## Sitzung 3 – Schnelle Korrekturen

Koordinaten sind erledigt (`47.47582 / 11.92516`, plus `hasMap` und `sameAs`).
Offen sind noch vier Punkte:

> 1. Die Social-Links im Footer zeigen auf `#`. Entferne die beiden Links
>    (Facebook, Instagram) samt umgebendem `div.social-links` aus allen
>    HTML-Dateien.
> 2. In `index.html` steht `og:image` auf `images/hero/hof-panorama.jpg` – die
>    Datei existiert noch nicht. Lege in der README einen klar sichtbaren
>    Hinweis an, dass dieses Bild vor dem Livegang existieren muss, und ergänze
>    `og:image:width`, `og:image:height` und `og:image:alt`.
> 3. Ergänze in allen Seiten `<meta name="twitter:card" content="summary_large_image">`
>    sowie og:title/og:description, wo sie fehlen.
> 4. Entferne das veraltete `<meta name="keywords">`.
> 5. Sieben Seiten verweisen auf `/favicon.ico`, die Datei existiert nicht.
>    Entweder anlegen oder die Verweise entfernen.

---

## Sitzung 4 – Hero vereinfachen

> Ersetze den vierteiligen Hero-Slider in `index.html` durch ein statisches
> Hero: das Video mit Poster bleibt, ebenso Label, H1 und die beiden Buttons
> aus Slide 1. Slides 2–4, die Pfeil-Buttons, die Dots und `js/slider.js`
> entfallen ersatzlos, ebenso der `<script src="js/slider.js">`-Tag und die
> zugehörigen CSS-Regeln in `css/style.css`.
>
> Wichtig: Die Inhalte aus Slides 2–4 (Berglsteiner See, Alpakas, Workation)
> dürfen nicht verloren gehen – sie sind bereits als USP-Kacheln weiter unten
> auf der Seite vorhanden. Prüfe das, bevor du löschst.
>
> Danach: Suche in allen Dateien nach übrig gebliebenen Slider-Referenzen.

Video separat auf der Kommandozeile:

```
ffmpeg -i hero.mp4 -c:v libvpx-vp9 -crf 36 -b:v 0 -an hero-neu.webm
```

Die aktuelle `hero.webm` ist mit 5,2 MB größer als die 3,4 MB große MP4 und
wird trotzdem zuerst ausgeliefert. Entweder neu kodieren (Ziel: unter 2 MB)
oder in `index.html` die `<source>`-Reihenfolge tauschen.

---

## Sitzung 5 – Icons und Typografie beruhigen

> 1. Die vier USP-Kacheln in `index.html` nutzen Emoji als Icons (🏔️ 🦙 💻 🌿).
>    Ersetze sie durch schlichte SVG-Outline-Icons im Stil der Bottom-Tab-Bar:
>    24×24, `stroke="currentColor"`, `stroke-width="2"`, `fill="none"`,
>    `aria-hidden="true"`. Berg, Tier, Laptop, Blatt. Inline im HTML.
> 2. `Cormorant Garamond` wird nur an wenigen Stellen genutzt und ist die dritte
>    Familie neben Playfair Display und Lato. Zeig mir zuerst, wo sie verwendet
>    wird, dann entscheide ich. Falls sie rausfliegt: Regeln auf `--font-heading`
>    umstellen, die vier Cormorant-Dateien aus `/fonts/` und die
>    `@font-face`-Blöcke entfernen.

Zusätzlich: Die Berg-Divider stehen zwischen fast jeder Sektion, zwei bis drei
reichen. Erst entscheiden, wenn die Fotos drin sind.

---

## Sitzung 6 – Fotos einbauen

Ohne Fotos geht die Seite nicht live. Aktuell 36 TODO-Marker und 25 Platzhalter,
`images/` enthält null Fotos.

Vorher selbst erledigen: Fotos machen und nach dem Schema ablegen, das in den
TODO-Kommentaren und `data-src`-Attributen bereits steht – z. B.
`images/bauernhof/alpakas-weide.jpg`, `images/hero/hof-panorama.jpg`.

> In `images/` liegen jetzt Fotos. Ersetze in allen HTML-Dateien die
> `div.img-placeholder`-Blöcke durch echte `<img>`-Tags.
>
> * Dateipfad aus dem jeweiligen TODO-Kommentar bzw. `data-src` übernehmen.
> * Alt-Text aus `data-alt` bzw. `aria-label` übernehmen; wo keiner da ist,
>   einen beschreibenden formulieren und mir zeigen.
> * `loading="lazy"` und `decoding="async"` an alle Bilder außer dem ersten.
> * `width` und `height` an jedes Bild, damit die Seite nicht springt.
> * Zeig mir am Ende die TODOs, die noch offen sind, weil das Foto fehlt.

Der Workflow `.github/workflows/optimize-images.yml` optimiert danach
automatisch – nicht vorab selbst komprimieren.

---

## Sitzung 7 – Inline-Styles konsolidieren

> Im HTML stehen viele Inline-`style`-Attribute. Analysiere zuerst, welche
> Muster sich wiederholen, und schlag mir Utility-Klassen vor. Ändere noch
> nichts. Nach meiner Freigabe: Klassen in `css/style.css` anlegen und die
> Inline-Styles ersetzen – nur die wiederkehrenden, nicht die Einzelfälle.

Nebenbei: In mehreren Seiten stehen unmaskierte `&` im Fließtext. Bei der
Gelegenheit mitkorrigieren.

---

## Sitzung 8 – Preise an einer Stelle pflegen

Preise stehen in `js/preise-config.js`, im JSON-LD von `index.html` und in
`llms.txt`.

> Schreib mir ein Node-Skript `scripts/preise-sync.js`, das
> `js/preise-config.js` als einzige Quelle liest und daraus die Preisangaben im
> JSON-LD von `index.html` sowie den Preisblock in `llms.txt` aktualisiert.
> Keine Abhängigkeiten, nur Node-Standardbibliothek. Ergänze in der README, wie
> ich es aufrufe.

Vorbild: `scripts/sitemap-lastmod.js` funktioniert nach demselben Muster.

---

## Sitzung 9 – Ton der Texte

Redaktion, am besten mit Kathrin gemeinsam.

> Geh die Fließtexte auf allen Seiten durch und markiere Formulierungen, die
> werblich überhöht sind – z. B. „modernes Ferienparadies", „Einzigartig in der
> Region!", „Echte Stille – ein echtes Erlebnis." Schlag jeweils eine nüchternere
> Variante vor. Ändere noch nichts, zeig mir nur Vorher/Nachher.
>
> Zusätzlich: Die Zeitleiste auf der Startseite hat vier Einträge, zwei ohne
> Jahreszahl, und „2026 – Die Alpakas kommen" veraltet schnell. Schlag eine
> Fassung mit drei echten Jahreszahlen vor.

---

# Englische Fassung (Sitzungen 10–14)

**Erst nach Sitzung 6 beginnen.** Solange Fotos fehlen und Sitzung 2 Inhalte
zwischen Seiten verschiebt, würden Texte übersetzt, die sich noch ändern – jede
spätere Änderung wäre dann doppelte Arbeit.

**Entschieden:** Unterordner `/en/`, alle Seiten werden übersetzt.

## Zwei Dinge, die vorab klar sein müssen

**Der Rahmen verdoppelt sich.** Aus 12 Dateien werden 24, und jede künftige
Änderung an Header oder Footer betrifft dann alle 24. Deshalb ist das
Prüfskript in Sitzung 14 kein Extra, sondern der Teil, der die Sache auf Dauer
tragfähig macht.

**Übersetzung nicht rein maschinell live stellen.** Bei einer Ferienwohnung
verkauft der Ton mit. Claude Code liefert eine Rohfassung, ein englischer
Muttersprachler sieht sie durch, bevor sie online geht.

---

## Sitzung 10 – Gerüst für /en/

> Lege eine englische Fassung der Website unter `/en/` an – in dieser Sitzung
> nur das Gerüst, noch keine Übersetzung der Fließtexte.
>
> 1. Kopiere alle zwölf HTML-Dateien nach `/en/`. Die Dateinamen werden
>    englisch: `index.html`, `apartment.html`, `prices.html`, `farm.html`,
>    `berglsteiner-lake.html`, `workation.html`, `surroundings.html`,
>    `location.html`, `contact.html`, `imprint.html`, `privacy.html`, `404.html`.
>    Zeig mir die Zuordnung vorher zur Freigabe.
> 2. **Wichtig:** Alle Pfade in den Seiten sind relativ (`css/style.css`,
>    `js/main.js`, `images/…`). In `/en/` müssen sie auf `../` umgestellt
>    werden, sonst lädt nichts. Prüfe jeden einzelnen Pfad.
> 3. Setze in allen `/en/`-Seiten `<html lang="en">`, `og:locale` auf `en`,
>    `inLanguage` im JSON-LD auf `en`, und `canonical` auf die eigene
>    englische URL.
> 4. Ergänze auf **allen 24 Seiten** die `hreflang`-Verweise:
>    `de-AT` auf die deutsche, `en` auf die englische Fassung, `x-default` auf
>    die deutsche.
> 5. Baue einen echten Sprachumschalter in Header und Mobil-Overlay – beide
>    Richtungen, auf jeder Seite zur jeweils entsprechenden Seite der anderen
>    Sprache verlinkt, nicht pauschal zur Startseite. Die CSS-Regel
>    `.lang-switcher` in `style.css` existiert bereits.
> 6. Danach: `grep` über alle 24 Dateien, ob `hreflang` und Umschalter überall
>    stehen und jeder Pfad auflösbar ist.

Fertig, wenn: `/en/` in `npx wrangler pages dev .` vollständig lädt (Design,
Bilder, Skripte) und der Umschalter in beide Richtungen auf der passenden
Seite landet.

---

## Sitzung 11 – Kernseiten übersetzen

> Übersetze die fünf wichtigsten Seiten unter `/en/` ins Englische:
> Startseite, Ferienwohnung, Preise, Lage, Kontakt.
>
> * Übersetze sinngemäß, nicht wörtlich. Zielgruppe sind Gäste aus GB, Irland,
>   den Niederlanden und Skandinavien.
> * Titles und Meta-Descriptions eigenständig formulieren – sie müssen
>   englische Suchanlässe treffen („holiday apartment Tyrol", „farm stay Austria"),
>   nicht die deutschen Wendungen nachbauen.
> * Ortsnamen, Straße und Betriebsname bleiben deutsch (Breitenbach am Inn,
>   Berglsteiner See, Oberberg 70).
> * Entfernungen und Zeiten in Kilometern und Minuten belassen.
> * Zeig mir am Ende eine Liste der Stellen, bei denen du unsicher warst.

---

## Sitzung 12 – Restliche Seiten und Rechtstexte

> Übersetze die verbleibenden Seiten unter `/en/`: Bauernhof, Berglsteiner See,
> Workation, Umgebung und die 404-Seite.
>
> Impressum und Datenschutz ebenfalls übersetzen, aber:
> * Setze an den Anfang beider Seiten einen deutlich sichtbaren Hinweis, dass
>   die deutsche Fassung rechtlich maßgeblich ist, mit Link dorthin.
> * Rechtsbegriffe nicht frei übersetzen – § 5 ECG, § 25 MedienG, UID-Nummer
>   und DSGVO-Bezeichnungen im Original stehen lassen und in Klammern erklären.
> * Beide Seiten bleiben `noindex` und gehören nicht in die Sitemap.

Vor dem Livegang von einem englischen Muttersprachler gegenlesen lassen; die
Rechtstexte zusätzlich bei der WKO-Prüfung mit vorlegen.

---

## Sitzung 13 – Formular, E-Mails und Kalender zweisprachig

Der Teil, der gern vergessen wird: Diese Texte stehen nicht im HTML, sondern
im JavaScript und in der Cloudflare-Function.

> Mache die dynamischen Texte sprachfähig. Kein Framework, keine
> Übersetzungsbibliothek – ein schlichtes Objekt `{ de: {...}, en: {...} }` je
> Datei reicht, die Sprache wird aus `document.documentElement.lang` gelesen.
>
> 1. `js/main.js` – die vier Formular-Fehlermeldungen und die Erfolgsmeldung.
> 2. `js/verfuegbarkeit.js` – Wochentagskürzel `['Mo','Di',…]`, Monatsnamen und
>    die aria-labels „Vorheriger/Nächster Monat".
> 3. `js/preise-config.js` – die Saisonbezeichnungen und
>    `toLocaleString('de-AT')` je nach Sprache.
> 4. `kontakt.html` / `contact.html` – Labels, Platzhalter und die
>    Auswahlfelder („2 Personen" → „2 guests").
> 5. `functions/api/kontakt.js` – die Server-Validierung **und** beide
>    E-Mail-Vorlagen. Das Formular sendet ein verstecktes Feld `sprache`; die
>    Bestätigung an den Gast kommt in seiner Sprache, die Benachrichtigung an
>    uns bleibt deutsch, nennt aber die Sprache der Anfrage.
> 6. `schema.sql` – Spalte `sprache TEXT` ergänzen und eine Migration dafür
>    beilegen. Die Tabelle `anfragen` hat sie noch nicht.

Fertig, wenn: eine Testanfrage über `/en/contact.html` eine englische
Bestätigung auslöst und der Eintrag in D1 die Sprache trägt.

---

## Sitzung 14 – SEO-Verdrahtung und Konsistenzprüfung

> Zwei Aufgaben zum Abschluss der englischen Fassung.
>
> 1. **Sitemap und llms.txt:** Ergänze die englischen Seiten in `sitemap.xml`,
>    jeweils mit `xhtml:link`-Paaren in beide Richtungen (de-AT, en, x-default).
>    `noindex`-Seiten bleiben draußen. Erweitere `scripts/sitemap-lastmod.js`,
>    sodass es auch `/en/`-Seiten erfasst. Lege eine englische `llms-en.txt` an
>    oder erweitere `llms.txt` um einen englischen Abschnitt – schlag mir vor,
>    was sinnvoller ist.
> 2. **Prüfskript `scripts/i18n-check.js`** (nur Node-Standardbibliothek):
>    * Jede deutsche Seite hat eine englische Entsprechung und umgekehrt.
>    * Header, Mobil-Overlay und Footer haben in beiden Sprachen dieselbe
>      Struktur – gleiche Anzahl Links, gleiche Reihenfolge, gleiche Ziele
>      (nur Sprache und Dateiname unterscheiden sich).
>    * `hreflang`-Paare sind wechselseitig und auflösbar.
>    * Alle relativen Pfade in `/en/` lösen auf.
>    * Kein deutscher Resttext in `/en/` (Suche nach Umlauten außerhalb von
>      Eigennamen und einer Ausnahmeliste).
>    Mit `--check` nur berichten, Exit-Code 1 bei Fehlern. In README aufnehmen.

Fertig, wenn: `node scripts/i18n-check.js` fehlerfrei durchläuft und das
Schema beider Sprachfassungen auf
<https://search.google.com/test/rich-results> sauber testet.

---

# Vor dem Livegang prüfen

- [ ] Alle TODO-Marker abgearbeitet: `grep -rn "TODO" *.html`
- [ ] Keine Platzhalter mehr: `grep -c "img-placeholder" *.html` ergibt überall 0
- [ ] og:image existiert und ist erreichbar (Link in WhatsApp an sich selbst schicken)
- [ ] Kontaktformular getestet – Mail kommt an, Eintrag landet in D1
- [ ] Verfügbarkeitskalender zeigt echte Airbnb-Belegung
- [ ] Preise stimmen an allen drei Stellen überein
- [x] Geo-Koordinaten geprüft
- [ ] Schema getestet auf <https://search.google.com/test/rich-results>
- [ ] Seite auf dem Handy durchgeklickt, nicht nur am Desktop
- [ ] Sitemap `lastmod` aktualisiert (`node scripts/sitemap-lastmod.js`)
- [ ] Google Search Console eingerichtet und Sitemap eingereicht

Zusätzlich, sobald die englische Fassung steht:

- [ ] `node scripts/i18n-check.js` läuft fehlerfrei
- [ ] Englische Texte von einem Muttersprachler gegengelesen
- [ ] Sprachumschalter auf jeder Seite in beide Richtungen getestet
- [ ] Testanfrage über `/en/contact.html` löst englische Bestätigung aus
- [ ] Search Console: englische Fassung als eigene Property eingereicht

---

# Git-Ablauf pro Sitzung

```
git pull                          # vor Beginn
# ... Claude-Code-Sitzung ...
git status                        # was hat sich geändert?
git diff                          # was genau? (q zum Beenden)
git add -A
git commit -m "Navigation vereinheitlicht"
git push
```

Wenn eine Sitzung schiefgeht und noch nichts committed ist:

```
git checkout -- .
```

Wenn schon committed, aber noch nicht gepusht:

```
git reset --hard HEAD~1
```

Deshalb: ein Thema pro Commit. Dann ist ein Rückschritt immer klein.
