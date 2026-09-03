# Kruckenhaus – Ferienwohnung Website

Offizielle Website der Ferienwohnung **Hof Kruckenhaus** in Breitenbach am Inn, Tirol.

**Domain:** kruckenhaus.at (registriert bei world4you)
**Hosting:** Cloudflare Pages (kostenlos)
**Technik:** HTML, CSS, JavaScript – kein Baukasten, kein Framework

---

## Wie das Ganze zusammenspielt (kurz erklärt)

Ein paar Dienste arbeiten zusammen – die meisten richtet ihr nur einmal ein:

| Dienst | Aufgabe | Kosten |
|---|---|---|
| **GitHub** (github.com/Tyrolius/Kruckenhaus) | Hier liegen die Website-Dateien. Jede Änderung wird hier gespeichert. | kostenlos |
| **Cloudflare Pages** (dash.cloudflare.com) | Der eigentliche „Server": zeigt die Website an, verarbeitet das Kontaktformular, holt den Airbnb-Kalender. | kostenlos |
| **Cloudflare D1** | Datenbank, in der die Kontaktanfragen gespeichert werden (Tabelle `anfragen`). | kostenlos |
| **Resend** (resend.com) | Verschickt die Benachrichtigungs-E-Mail bei neuen Anfragen an info@kruckenhaus.at. | kostenlos (bis 3.000 E-Mails/Monat) |
| **world4you** | Registrar der Domain `kruckenhaus.at` (und ggf. eure E-Mail-Postfächer). | euer bestehender Vertrag |

> **Warum Cloudflare?** Das Kontaktformular und der Airbnb-Verfügbarkeitskalender
> laufen über serverseitige Funktionen (Cloudflare Pages Functions), die es auf
> klassischem world4you-Webspace nicht gibt. Hosting + Datenbank + DNS aus einer
> Hand bei Cloudflare ist unkompliziert und für diese Website komplett kostenlos.

**Der Ablauf im Überblick:** Ihr ändert etwas an den Dateien (z. B. über
claude.ai/code oder direkt auf github.com) → GitHub speichert es → Cloudflare
Pages veröffentlicht es automatisch nach 1–2 Minuten. FTP-Uploads wie früher
braucht es nicht.

---

## Schritt 1: Website auf Cloudflare Pages veröffentlichen (ca. 10 Min.)

1. Auf [dash.cloudflare.com](https://dash.cloudflare.com) ein (kostenloses) Konto
   anlegen bzw. einloggen.
2. Links im Menü **Workers & Pages → Create → Pages → Connect to Git**
3. Das **GitHub-Konto verbinden** und das Repository **`Tyrolius/Kruckenhaus`** auswählen.
4. Build-Einstellungen:
   - **Framework preset:** `None`
   - **Build command:** leer lassen
   - **Build output directory:** `/`
   - **Production branch:** `master`
5. **Save and Deploy** klicken.

Nach 1–2 Minuten ist die Website unter einer Adresse wie
`https://kruckenhaus.pages.dev` erreichbar. Diese Adresse gleich testen –
das ist schon eure echte Website, nur noch ohne eigene Domain.

> Die Datei `wrangler.toml` im Projekt enthält bereits die Grundkonfiguration
> inklusive der D1-Datenbank-Anbindung – Cloudflare liest sie beim Deploy
> automatisch aus.

---

## Schritt 2: Kontaktformular scharf schalten (ca. 10 Min.)

Ohne diesen Schritt landen Anfragen nirgends! Das Formular speichert jede Anfrage
in der Datenbank (Cloudflare D1) **und** schickt euch eine E-Mail (über Resend).

### 2a. Datenbank-Anbindung prüfen

Die D1-Datenbank `kruckenhaus` und die Tabelle `anfragen` sind bereits angelegt.
In Cloudflare Pages muss die Datenbank nur mit der Website verbunden sein:

- **Workers & Pages → kruckenhaus → Settings → Bindings → D1 database bindings**
- Falls noch nicht vorhanden: Binding mit **Variable name `DB`** → Datenbank
  **`kruckenhaus`** hinzufügen. (Über `wrangler.toml` ist das i. d. R. schon gesetzt.)

### 2b. E-Mail-Versand über Resend einrichten

1. Auf [resend.com](https://resend.com) ein kostenloses Konto anlegen.
2. **Domains → Add Domain** → `kruckenhaus.at` eintragen. Resend zeigt einige
   DNS-Einträge (SPF/DKIM) an – diese kommen in Cloudflare (siehe Schritt 4).
3. Sobald die Domain „Verified" ist: **API Keys → Create API Key** → Key kopieren.
4. In Cloudflare: **Workers & Pages → kruckenhaus → Settings → Variables and
   Secrets** → als **Secret** hinzufügen:
   - **Name:** `RESEND_API_KEY` — **Value:** der kopierte Resend-Key
5. Danach einmal neu veröffentlichen: **Deployments → … → Retry deployment**.
6. **Testen:** Auf der Website eine Testanfrage über das Kontaktformular schicken
   und prüfen, ob sie per E-Mail bei info@kruckenhaus.at ankommt (auch Spam-Ordner).

> **Ohne `RESEND_API_KEY`** funktioniert das Formular trotzdem – die Anfrage
> wird dann nur in der Datenbank gespeichert, aber es geht keine E-Mail raus.

### 2c. Anfragen in der Datenbank nachsehen

Alle Einsendungen liegen zusätzlich in der D1-Datenbank. Nachsehen z. B. im
Cloudflare-Dashboard unter **Storage & Databases → D1 → kruckenhaus → Console**:

```sql
SELECT erstellt_am, name, email, telefon, anreise, abreise, personen, nachricht
FROM anfragen ORDER BY erstellt_am DESC;
```

---

## Schritt 3: Airbnb-Kalender verbinden (ca. 5 Min.)

Damit zeigt die Website automatisch an, wann die Wohnung belegt ist.

1. Bei **Airbnb** einloggen → Kalender der Ferienwohnung öffnen →
   **Verfügbarkeit → Kalender verknüpfen → Kalender exportieren** →
   den angezeigten Link kopieren (endet auf `.ics?s=…`)
   ⚠️ Dieser Link ist geheim – nirgends veröffentlichen!
2. In Cloudflare: **Workers & Pages → kruckenhaus → Settings → Variables and
   Secrets** → als **Secret** hinzufügen:
   - **Name:** `AIRBNB_ICAL_URL` — **Value:** der kopierte Link
3. Neu veröffentlichen: **Deployments → … → Retry deployment**.
4. **Testen:** Auf der Website unter „Ferienwohnung → Verfügbarkeit & Buchung"
   müssen die in Airbnb belegten Tage als belegt erscheinen
   (Aktualisierung kann bis zu 1 Stunde + Airbnb-Verzögerung dauern).

**Wichtig im Alltag:** Der Abgleich läuft nur in eine Richtung
(Airbnb → Website). Wenn ihr eine Anfrage über die Website bestätigt, müsst
ihr die Tage **selbst im Airbnb-Kalender blockieren**. Kommt später
Booking.com dazu: dessen iCal-Link einfach per Komma an die Variable anhängen.

---

## Schritt 4: Domain kruckenhaus.at zu Cloudflare umziehen (ca. 20 Min. + Wartezeit)

Für Cloudflare Pages verwaltet ihr die Domain am einfachsten direkt bei Cloudflare
(DNS + Proxy). Der Registrar bleibt world4you – es wechseln nur die Nameserver.

### 4a-vorab: Bestehende DNS-Einträge sichern (Stand 03.09.2026)

Die Domain liegt aktuell **komplett bei world4you** (Nameserver `ns1/ns2.world4you.at`),
dort läuft auch das Postfach `info@kruckenhaus.at`. Diese Einträge müssen nach dem
Umzug in Cloudflare wieder vorhanden sein – Haken setzen, sobald jeder Eintrag in
Cloudflare angelegt ist:

| ✓ | Name | Typ | Wert | Wofür |
|---|---|---|---|---|
| [ ] | `kruckenhaus.at` | MX (Prio 10) | `mail.kruckenhaus.at` | E-Mail-Empfang |
| [ ] | `mail` | A | `81.19.149.74` | Mailserver von world4you |
| [ ] | `imap` | CNAME | `imap.world4you.com` | Postfachabruf im Mailprogramm |
| [ ] | `kruckenhaus.at` | TXT | `v=spf1 mx include:spf.w4ymail.at -all` | SPF – sonst landet ausgehende Post im Spam |
| [ ] | `_dmarc` | TXT | `v=DMARC1;p=none;` | DMARC |
| [ ] | `resend._domainkey` | TXT | langer `p=MIGf…`-Schlüssel, **1:1 aus world4you kopieren** | DKIM für Resend (Schritt 2b) |
| [ ] | `send` | MX (Prio 10) | `feedback-smtp.eu-west-1.amazonses.com` | Resend-Bounces |
| [ ] | `send` | TXT | `v=spf1 include:amazonses.com ~all` | SPF für Resend |
| [ ] | `kruckenhaus.at` / `www` | A | *entfällt* – ersetzt Cloudflare in Schritt 4c durch den Pages-Eintrag | Website |

> Die A-Einträge von `kruckenhaus.at` und `www` zeigen derzeit auf `81.19.145.44`
> (world4you-Webhosting). **Nur diese beiden** werden beim Umzug ersetzt; alles
> andere in der Tabelle bleibt unverändert.
>
> Aktuellen Stand jederzeit selbst prüfen, z. B. mit
> `dig MX kruckenhaus.at`, `dig TXT kruckenhaus.at`, `dig NS kruckenhaus.at`
> oder über [dnschecker.org](https://dnschecker.org).

### 4a. Domain in Cloudflare aufnehmen

1. Cloudflare-Dashboard → **Add a domain** (oben) → `kruckenhaus.at` eingeben →
   **kostenlosen Free-Plan** wählen.
2. Cloudflare scannt die bestehenden DNS-Einträge. **Prüft die Liste gegen die
   Tabelle oben** und ergänzt jeden Eintrag, den Cloudflare nicht selbst gefunden
   hat – besonders MX, SPF/DKIM und die Resend-Einträge.
3. Cloudflare zeigt euch **zwei Nameserver** an (z. B. `xxx.ns.cloudflare.com`).

> ⚠️ **E-Mail nicht kaputt machen:** Wenn eure Postfächer bei world4you liegen,
> müssen die MX- und Mail-TXT-Einträge **1:1 in Cloudflare übernommen** werden,
> bevor ihr die Nameserver umstellt. Im Zweifel vorher einen Screenshot aller
> world4you-Einträge machen.

### 4b. Nameserver bei world4you umstellen

1. Im [world4you-Kundencenter](https://my.world4you.com) einloggen.
2. **Meine Domains → kruckenhaus.at → Nameserver bearbeiten**.
3. Die world4you-Nameserver durch die **zwei Cloudflare-Nameserver** aus 4a ersetzen.
4. Speichern. Die Umstellung dauert meist wenige Stunden (selten bis 24 h);
   Cloudflare schickt eine E-Mail, sobald die Domain „Active" ist.

### 4c. Website-Einträge auf Cloudflare Pages zeigen lassen

1. Cloudflare-Dashboard → **Workers & Pages → kruckenhaus → Custom domains →
   Set up a custom domain** → `kruckenhaus.at` und `www.kruckenhaus.at` hinzufügen.
2. Cloudflare legt die nötigen DNS-Einträge (CNAME auf `kruckenhaus.pages.dev`)
   automatisch an.

### 4d. HTTPS

Cloudflare stellt automatisch ein kostenloses SSL-Zertifikat aus. Prüfen:
`https://www.kruckenhaus.at` muss mit Schloss-Symbol laden.

> **Alternative ohne Nameserver-Umzug:** Wollt ihr die DNS-Verwaltung bei
> world4you belassen, könnt ihr die Domain auch nur per CNAME/A-Eintrag auf die
> `pages.dev`-Adresse zeigen lassen. Der Nameserver-Umzug zu Cloudflare ist aber
> die empfohlene, wartungsärmere Variante (schnelleres CDN, einfache Verwaltung).

---

## Schritt 5: Fotos einfügen (der wichtigste Schritt!)

Die Website zeigt aktuell überall farbige Platzhalter. **Für eine
Ferienunterkunft sind echte Fotos das wichtigste Verkaufsargument** – bitte vor
dem Livegang erledigen. Die wichtigsten Motive:

| Priorität | Motiv | Verwendung |
|---|---|---|
| ★★★ | Hof-Panorama mit Bergen | Startseite (groß), Vorschaubild beim Teilen |
| ★★★ | Wohnzimmer, Schlafzimmer, Küche, Bad, Balkon | Ferienwohnungs-Galerie |
| ★★★ | Alpakas auf der Weide | Startseite, Bauernhof-Seite |
| ★★ | Berglsteiner See (Sommer & Herbst) | See-Seite, Galerie |
| ★★ | Hofladen / Selbstbedienungs-Kühlschrank | Bauernhof-Seite |
| ★★ | Arbeitsplatz mit Bergblick + Speedtest-Screenshot | Workation-Seite |
| ★ | Logo als `images/logo.png`, Favicon als `favicon.ico` | Kopfzeile, Browser-Tab |
| ★ | Kurzes Hof-Video als `hero.mp4` + Standbild `hero-poster.jpg` | Startseiten-Video (optional – ohne Video einfach ein Foto verwenden) |

**Praktische Umsetzung als Website-Neuling:** Die Bilder einfach in den
Ordner `images/` hochladen (auf github.com: Ordner öffnen → **Add file →
Upload files**) – auch direkt vom Handy, ganz ohne Vorbearbeitung. Ein
GitHub Action (`.github/workflows/optimize-images.yml`) verkleinert und
komprimiert jedes Foto danach automatisch auf Web-taugliche Maße (siehe
Kasten unten). Anschließend in einer **claude.ai/code-Sitzung** den Auftrag
geben: *„Ersetze die Foto-Platzhalter durch die hochgeladenen Bilder in
images/"* – die Platzhalter sind im Code als `TODO:`-Kommentare markiert,
inklusive gewünschtem Motiv.

> **Automatische Foto-Optimierung:** Jedes Bild unter `images/` (auch in
> Unterordnern) wird bei jedem Push automatisch auf max. 1600 px Breite und
> ca. 300 KB gebracht – ihr müsst nichts mehr manuell verkleinern. Bilder,
> die diese Werte schon einhalten, fasst der Workflow nicht an, damit
> wiederholtes Komprimieren nicht unnötig an Qualität kostet. Ausgenommen
> ist `images/logo.png` (Markenbild, feste Maße). Ergebnis in wenigen
> Minuten im Reiter **Actions** des Repositories nachvollziehbar; das
> optimierte Bild landet als eigener Commit im selben Branch.

> **Wichtig für die Ladezeit:** Die eingefügten Galeriebilder brauchen
> `loading="lazy"` und `decoding="async"`, damit sie erst beim Scrollen geladen
> werden. Ausgenommen ist das große Startseiten-Bild „above the fold". Wer die
> Fotos per claude.ai/code einsetzen lässt, bekommt das automatisch mit erledigt.
> Ebenso sollte dann `images/hero/hof-panorama.jpg` existieren – darauf zeigt
> bereits das `og:image` der Startseite (Vorschaubild beim Teilen).

---

## Schritt 6: Checkliste vor dem Livegang

- [ ] Testanfrage über das Kontaktformular kommt per E-Mail an (Schritt 2)
- [ ] Belegungskalender zeigt die Airbnb-Buchungen (Schritt 3)
- [ ] `https://www.kruckenhaus.at` lädt mit Schloss-Symbol (Schritt 4)
- [ ] E-Mail-Empfang (info@kruckenhaus.at) funktioniert nach dem DNS-Umzug noch
- [ ] Fotos eingefügt (Schritt 5)
- [ ] Website einmal komplett am **Handy** durchklicken
- [ ] **Gästestimmen ersetzen:** Die vier Bewertungen auf der Startseite sind
      Platzhalter-Texte. Vor dem Livegang durch echte Zitate (z. B. aus euren
      Airbnb-Bewertungen, mit Einverständnis) ersetzen oder entfernen –
      erfundene Bewertungen sind wettbewerbsrechtlich heikel.
- [ ] **Alpaka-Namen eintragen:** Auf der Bauernhof-Seite stehen noch
      „Alpaka-Stute 1/2/3" – echte Namen (Noblesse, Bellissima, Marée) einsetzen
- [ ] Social-Media-Links im Footer der Startseite führen noch auf `#` –
      echte Profile verlinken oder Icons entfernen
- [x] Aufenthaltsabgabe (3,50 € p. P./Nacht) und die steuerliche Einordnung als
      Vermietung und Verpachtung mit 10 % USt sind steuerlich abgeklärt.
      Satz bei künftigen Änderungen in `js/preise-config.js` anpassen.
- [ ] `node scripts/sitemap-lastmod.js` laufen lassen, damit die Änderungsdaten
      in `sitemap.xml` zum Stand der Seiten passen
      (Die Abgabenübersicht des Landes Tirol nennt für den TVB Alpbachtal ab
      1. 5. 2026 einen Satz von 4,00 € – beim TVB gegenprüfen.)
- [ ] **Airbnb-Preise angleichen:** Die Website verspricht „Bestpreis“ (nie
      teurer als auf Portalen). Die Saisonpreise in `js/preise-config.js` sind
      ein Vorschlag aus `docs/OPTIMIERUNGSPLAN.md` – vor dem Livegang mit den
      Airbnb-Preisen abstimmen, sodass Airbnb nie günstiger ist.
- [ ] Impressum & Datenschutz einmal von WKO Tirol / Anwalt gegenlesen lassen
      (Texte sind ausgearbeitet, aber das ist keine Rechtsberatung)

---

## Besucherzahlen & SEO im Blick behalten (empfohlen, ca. 15 Min.)

Zwei kostenlose Tools reichen aus, um zu sehen, wie die Website läuft und
woher Besucher kommen (z. B. später vom Instagram-Kanal) – **ganz ohne
Cookies oder Einwilligungs-Banner**. Beide brauchen die fertig auf Cloudflare
laufende Domain (Schritt 4), machen also erst danach Sinn.

### 1. Google Search Console – zeigt, wie ihr bei Google ankommt

Beantwortet: Mit welchen Suchbegriffen finden Leute die Seite? Wie oft
erscheint sie in den Ergebnissen, wie oft wird tatsächlich draufgeklickt?
Gibt es Seiten, die Google nicht richtig anzeigt?

1. Auf [search.google.com/search-console](https://search.google.com/search-console)
   mit einem Google-Konto anmelden → **Property hinzufügen** → **Domain**
   (nicht „URL-Präfix") → `kruckenhaus.at` eingeben.
2. Google zeigt einen **DNS-TXT-Eintrag** zur Bestätigung an. Diesen bei
   **Cloudflare → DNS → Records → Add record** (Typ `TXT`, Name `@`, Inhalt
   wie von Google angezeigt) eintragen und in der Search Console auf
   **Bestätigen** klicken.
3. Danach: **Sitemaps** (linkes Menü) → `sitemap.xml` eintragen und senden
   (die Datei liegt schon fertig im Projekt).
4. Nach ein paar Tagen füllen sich **Leistung** (Suchbegriffe, Klicks) und
   **Abdeckung** (Indexierungsstatus) mit echten Daten.

### 2. Cloudflare Web Analytics – zeigt, wer die Website besucht

Beantwortet: Wie viele Seitenaufrufe gibt es, welche Seiten werden am
häufigsten angeschaut, aus welchem Land kommen Besucher, und – besonders
relevant für einen späteren Instagram-Kanal – **von welcher Seite kommen
Besucher** (Google, direkt eingetippt, oder eben ein Link aus der
Instagram-Bio).

1. **Cloudflare-Dashboard → Analytics & Logs → Web Analytics → Add a site**
   → `kruckenhaus.at` → *Automatic setup*. Cloudflare fügt das Messskript
   selbst ein, keine Code-Änderung nötig.
2. Im Reiter **Referrer** seht ihr später automatisch `instagram.com` (oder
   `l.instagram.com`) auftauchen, sobald der Website-Link in der
   Instagram-Bio steht und geklickt wird – ganz ohne weitere Einrichtung.

> **Warum kein Google Analytics oder Meta-Pixel?** Diese Tools würden echte
> Werbe-Erfolgsmessung (z. B. „diese Google-Ads-Anzeige hat zu einer Buchung
> geführt") ermöglichen, setzen dafür aber Tracking-Cookies – was den gerade
> entfernten Cookie-Banner wieder nötig machen würde. Da aktuell keine
> bezahlte Werbung geplant ist, lohnt sich dieser Tausch nicht. Falls sich
> das ändert: einfach Bescheid geben, dann wird das sauber nachgerüstet
> (inkl. Consent-Banner nur für diesen Fall).

---

## Nach dem Livegang: Änderungen machen

Jede gespeicherte Änderung im GitHub-Repository geht **automatisch** nach 1–2
Minuten online. Drei Wege, vom einfachsten zum flexibelsten:

1. **claude.ai/code:** Auftrag in normalem Deutsch geben („Ändere den
   Nebensaison-Preis auf 130 €") – so wie diese Website entstanden ist.
2. **GitHub-Web-Editor:** Auf github.com die Datei öffnen → Stift-Symbol →
   ändern → **Commit changes**. Gut für kleine Textänderungen.
3. **Lokal am Computer:** Repository klonen, ändern, `git push`.

### Häufige Anpassungen – wo finde ich was?

| Was ändern? | Wo? |
|---|---|
| **Preise, Saisonzeiten, Mindestaufenthalt, Rabatte, Storno-Fristen** | `js/preise-config.js` – vier Saisonstufen mit Datumsbereichen, alle Werte zentral mit Kommentaren erklärt. Preisseite und Workation-Seite lesen daraus. |
| Texte einer Seite | jeweilige `.html`-Datei (z. B. `bauernhof.html`) |
| Telefon/E-Mail | in allen `.html`-Dateien (Suchen & Ersetzen) |
| Farben & Schriften | `css/style.css`, Abschnitt `:root { --color-… }` |
| Copyright-Jahr | Footer aller `.html`-Dateien (`© 2025`) |
| Airbnb-/Booking-Kalenderlinks | Cloudflare-Secret `AIRBNB_ICAL_URL` |
| **Preise für Google & KI-Systeme** | nach einer Preisänderung auch `llms.txt`, den `makesOffer`-Block in `index.html` und die „ab 125 €“-Angaben auf Start-, Ferienwohnungs- und Workation-Seite anpassen |
| Änderungsdatum in der Sitemap | `node scripts/sitemap-lastmod.js` ausführen – trägt die Daten automatisch nach |
| **Optimierungsplan, Preisstrategie, Rechtsprüfung** | `docs/OPTIMIERUNGSPLAN.md` (intern; `_redirects` verhindert den öffentlichen Abruf) |
| FAQ-Texte | `kontakt.html` – die Fragen stehen dort **zweimal**: sichtbar als `<details>` und im FAQ-Markup im `<head>`. Beide gleich halten. |
| Empfänger-/Absender-E-Mail des Formulars | Cloudflare-Variablen `CONTACT_TO` / `CONTACT_FROM` |

---

### Sitemap aktuell halten (nach Textänderungen)

In `sitemap.xml` steht bei jeder Seite ein Datum (`<lastmod>`), das Google
verrät, wann sie zuletzt geändert wurde. Von Hand geht das erfahrungsgemäß
schief – und ein falsches Datum ist schlechter als keines, weil Google die
Angabe dann komplett ignoriert.

Deshalb gibt es ein kleines Skript. Einmal im Repo-Ordner aufrufen:

```
node scripts/sitemap-lastmod.js
```

Es liest für jede Seite das echte Änderungsdatum aus der Git-Historie und
trägt es ein. Seiten mit noch nicht gespeicherten Änderungen bekommen das
heutige Datum. Ausgegeben wird, was sich geändert hat – danach wie gewohnt
`git add -A`, `git commit`, `git push`.

Nur nachsehen, ohne etwas zu ändern:

```
node scripts/sitemap-lastmod.js --check
```

Am besten kurz vor dem Commit laufen lassen, wenn ihr Seitentexte geändert
habt. Nach reinen Bild- oder CSS-Änderungen ist es nicht nötig.

---

## Dateistruktur

```
/
├── index.html               → Startseite
├── ferienwohnung.html       → Wohnung, Galerie, Verfügbarkeitskalender
├── preise.html              → Preise, Zahlungsarten, Storno, Kalender
├── bauernhof.html           → Hof, Alpakas, Hofladen
├── berglsteiner-see.html    → Der See, Wanderroute
├── workation.html           → Arbeiten mit Starlink-Internet
├── umgebung.html / lage.html→ Ausflugsziele, Anfahrt
├── kontakt.html             → Kontaktformular
├── impressum.html           → Impressum (§ 5 ECG, § 25 MedienG, UID)
├── datenschutz.html         → Datenschutzerklärung (DSGVO)
├── wrangler.toml            → Cloudflare-Pages-Konfiguration (nicht löschen!)
├── schema.sql               → D1-Datenbankschema (Tabelle „anfragen")
├── _headers                 → HTTP-Header & Cache-Regeln (Cloudflare Pages)
├── _redirects               → Weiterleitungen; sperrt docs/ für Besucher
├── docs/OPTIMIERUNGSPLAN.md → Interner Plan: Direktbuchungen, Preise, Rechtsprüfung
├── sitemap.xml / robots.txt → Für Google & Co.
├── llms.txt                 → Angebotsübersicht für KI-Systeme (ChatGPT, Claude …)
├── css/style.css            → Design (Farben, Schriften, Layout)
├── js/main.js               → Navigation, Formular, Animationen
├── js/verfuegbarkeit.js     → Belegungskalender (Anzeige)
├── js/preise-config.js      → ALLE Preise zentral
├── functions/api/availability.js → Holt den Airbnb-Kalender (Server)
├── functions/api/kontakt.js      → Nimmt Formularanfragen entgegen (D1 + E-Mail)
├── .github/workflows/optimize-images.yml → Verkleinert hochgeladene Fotos automatisch
├── .github/scripts/optimize-images.js    → Das zugehörige Skript (sharp)
├── scripts/sitemap-lastmod.js → Trägt die Änderungsdaten in sitemap.xml nach
├── fonts/                   → Lokal gehostete Schriften (DSGVO – nicht löschen!)
└── images/                  → Fotos (siehe Schritt 5)
```

---

## Datenbank: Buchungsmodell (Grundlage, noch nicht mit der Website verbunden)

Die D1-Datenbank `kruckenhaus` enthält – **unabhängig vom Kontaktformular** –
bereits ein Datenmodell für ein mögliches eigenes Buchungs-/Preissystem. Es ist
aktuell **nicht mit der Website verknüpft**: Preise kommen weiterhin aus
`js/preise-config.js`, die Verfügbarkeit aus dem Airbnb-iCal-Abgleich. Das Modell
ist eine Vorbereitung für später und wird von der laufenden Website nicht benötigt.

| Tabelle | Zweck | Stand |
|---|---|---|
| `einheiten` | Vermietbare Einheiten (Name, Betten, Basispreis) | **3 Einträge** |
| `preisperioden` | Saison-/Zeitraumpreise je Einheit inkl. Mindestnächte | leer |
| `buchungen` | Bestätigte Buchungen (Zeitraum, Gast, Quelle, Preis, Status) | leer |
| `naechte` | Einzelne belegte Nächte je Buchung (für schnelle Verfügbarkeitsabfragen) | leer |
| `anfragen` | Kontaktanfragen aus dem Formular (aus dieser Migration) | leer |

Aktuell hinterlegte Einheiten in `einheiten`:

| id | name | betten | basispreis |
|---|---|---|---|
| 1 | Ferienwohnung | 4 | 130 € |
| 2 | Zimmer Berglstein | 2 | 60 € |
| 3 | Zimmer Reintal | 2 | 60 € |

> **Zu den beiden Zimmern:** Sie werden seit September 2026 nicht mehr vermietet
> (Eigenbedarf) und kommen auf der Website nicht vor. Die beiden Einträge in
> `einheiten` können gelöscht werden, sobald das Inserat auf alpbachtal.at
> (dort stehen sie noch mit 40 €/Person) entfernt ist.

> Wer daraus später ein echtes Buchungssystem bauen will, könnte Verfügbarkeit und
> Preise aus D1 statt aus `preise-config.js`/Airbnb speisen. Bis dahin kann das
> Modell unverändert liegen bleiben – es stört den Website-Betrieb nicht.

---

## Technische Hinweise

- **Schriften bleiben lokal:** Die Schriftarten liegen bewusst im Ordner
  `/fonts/` statt bei Google (DSGVO). Bei Design-Änderungen beibehalten.
- **Kein Tracking im Code:** Es ist absichtlich kein Google Analytics o. Ä.
  eingebaut. Die Website setzt keine Cookies und verwendet keinerlei lokale
  Speicherung im Browser – daher gibt es auch keinen Cookie-Banner.
  Besucherzahlen und SEO-Daten: siehe Abschnitt
  „Besucherzahlen & SEO im Blick behalten" oben.
- **Lokal testen** (optional): Mit installiertem Node.js im Projektordner
  `npx wrangler pages dev .` ausführen – damit laufen auch die Functions
  (Formular, Kalender) lokal. Ein reiner Datei-Server (`python3 -m http.server`)
  zeigt nur die Seiten ohne serverseitige Funktionen.
- **D1-Schema ändern:** Anpassungen in `schema.sql` vornehmen und mit
  `npx wrangler d1 execute kruckenhaus --remote --file=./schema.sql` einspielen.
- **Buchungssystem-Upgrade:** Bei mehr Buchungsvolumen kann ein Channel Manager
  (Smoobu, DiBooq, Feratel) den Kalender ersetzen – dessen Widget kommt dann in
  den `<div id="booking-widget">` auf `ferienwohnung.html` und `preise.html`.

---

*Hof Kruckenhaus – Kathrin & Florian Häusler, Oberberg 70, 6252 Breitenbach am Inn*
