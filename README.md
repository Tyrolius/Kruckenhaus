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

### 4a. Domain in Cloudflare aufnehmen

1. Cloudflare-Dashboard → **Add a domain** (oben) → `kruckenhaus.at` eingeben →
   **kostenlosen Free-Plan** wählen.
2. Cloudflare scannt die bestehenden DNS-Einträge. **Prüft die Liste genau** und
   ergänzt fehlende Einträge – besonders wichtig:
   - die **MX-Einträge** eurer E-Mail-Postfächer (info@kruckenhaus.at),
   - zugehörige **SPF/DKIM-TXT-Einträge**,
   - die **Resend-Einträge** aus Schritt 2b.
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

**Praktische Umsetzung als Website-Neuling:** Fotos zuerst verkleinern
(z. B. auf [squoosh.app](https://squoosh.app), Ziel: unter 300 KB pro Bild,
Querformat ca. 1600 px breit). Dann die Bilder in den Ordner `images/`
hochladen (auf github.com: Ordner öffnen → **Add file → Upload files**) und
anschließend in einer **claude.ai/code-Sitzung** den Auftrag geben:
*„Ersetze die Foto-Platzhalter durch die hochgeladenen Bilder in images/"* –
die Platzhalter sind im Code als `TODO:`-Kommentare markiert, inklusive
gewünschtem Motiv und Bildgröße.

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
- [ ] Ortstaxe-Satz (derzeit 2,80 €) bei der Gemeinde Breitenbach bestätigen
- [ ] Impressum & Datenschutz einmal von WKO Tirol / Anwalt gegenlesen lassen
      (Texte sind ausgearbeitet, aber das ist keine Rechtsberatung)

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
| **Preise, Mindestaufenthalt, Storno-Fristen** | `js/preise-config.js` – alle Werte zentral mit Kommentaren erklärt |
| Texte einer Seite | jeweilige `.html`-Datei (z. B. `bauernhof.html`) |
| Telefon/E-Mail | in allen `.html`-Dateien (Suchen & Ersetzen) |
| Farben & Schriften | `css/style.css`, Abschnitt `:root { --color-… }` |
| Copyright-Jahr | Footer aller `.html`-Dateien (`© 2025`) |
| Airbnb-/Booking-Kalenderlinks | Cloudflare-Secret `AIRBNB_ICAL_URL` |
| Empfänger-/Absender-E-Mail des Formulars | Cloudflare-Variablen `CONTACT_TO` / `CONTACT_FROM` |

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
├── sitemap.xml / robots.txt → Für Google & Co.
├── css/style.css            → Design (Farben, Schriften, Layout)
├── js/main.js               → Navigation, Formular, Animationen
├── js/verfuegbarkeit.js     → Belegungskalender (Anzeige)
├── js/preise-config.js      → ALLE Preise zentral
├── functions/api/availability.js → Holt den Airbnb-Kalender (Server)
├── functions/api/kontakt.js      → Nimmt Formularanfragen entgegen (D1 + E-Mail)
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

> Wer daraus später ein echtes Buchungssystem bauen will, könnte Verfügbarkeit und
> Preise aus D1 statt aus `preise-config.js`/Airbnb speisen. Bis dahin kann das
> Modell unverändert liegen bleiben – es stört den Website-Betrieb nicht.

---

## Technische Hinweise

- **Schriften bleiben lokal:** Die Schriftarten liegen bewusst im Ordner
  `/fonts/` statt bei Google (DSGVO). Bei Design-Änderungen beibehalten.
- **Kein Tracking:** Es ist absichtlich kein Google Analytics o. Ä. eingebaut.
  Besucherzahlen DSGVO-freundlich nachrüsten: **Cloudflare Web Analytics**
  (kostenlos, cookielos) oder z. B. Plausible/Fathom.
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
