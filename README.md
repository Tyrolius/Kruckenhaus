# Kruckenhaus – Ferienwohnung Website

Offizielle Website der Ferienwohnung **Hof Kruckenhaus** in Breitenbach am Inn, Tirol.

**Domain:** kruckenhaus.at (registriert bei world4you)
**Hosting:** Netlify (kostenlos)
**Technik:** HTML, CSS, JavaScript – kein Baukasten, kein Framework

---

## Wie das Ganze zusammenspielt (kurz erklärt)

Drei Dienste arbeiten zusammen – alle drei braucht ihr nur einmal einzurichten:

| Dienst | Aufgabe | Kosten |
|---|---|---|
| **GitHub** (github.com/Tyrolius/Kruckenhaus) | Hier liegen die Website-Dateien. Jede Änderung wird hier gespeichert. | kostenlos |
| **Netlify** (netlify.com) | Der eigentliche „Server": zeigt die Website an, verschickt das Kontaktformular, holt den Airbnb-Kalender. | kostenlos |
| **world4you** | Verwaltet nur die Domain `kruckenhaus.at` (und ggf. eure E-Mail-Postfächer). | euer bestehender Vertrag |

> **Warum nicht alles bei world4you?** Das Kontaktformular und der
> Airbnb-Verfügbarkeitskalender laufen über Netlify-Funktionen, die es auf
> klassischem world4you-Webspace nicht gibt. Domain bei world4you + Hosting bei
> Netlify ist eine ganz übliche Kombination – ihr zahlt dadurch nichts extra.

**Der Ablauf im Überblick:** Ihr ändert etwas an den Dateien (z. B. über
claude.ai/code oder direkt auf github.com) → GitHub speichert es → Netlify
veröffentlicht es automatisch nach 1–2 Minuten. FTP-Uploads wie früher braucht
es nicht.

---

## Schritt 1: Website auf Netlify veröffentlichen (ca. 10 Min.)

1. Auf [netlify.com](https://www.netlify.com) gehen → **Sign up** → mit dem
   **GitHub-Konto** anmelden (Button „GitHub"). So sind beide Dienste gleich verbunden.
2. Im Netlify-Dashboard: **Add new site → Import an existing project → GitHub**
3. Das Repository **`Tyrolius/Kruckenhaus`** auswählen
4. Einstellungen im Formular:
   - **Branch to deploy:** `main`
   - **Build command:** leer lassen
   - **Publish directory:** `.` (nur ein Punkt)
5. **Deploy site** klicken

Nach 1–2 Minuten ist die Website unter einer Adresse wie
`https://zufallsname-123.netlify.app` erreichbar. Diese Adresse gleich testen –
das ist schon eure echte Website, nur noch ohne eigene Domain.

**Tipp:** Unter **Site configuration → Site details → Change site name** könnt
ihr den Zufallsnamen in z. B. `kruckenhaus` ändern.

---

## Schritt 2: Kontaktformular scharf schalten (ca. 5 Min.)

Ohne diesen Schritt landen Anfragen nirgends!

1. Netlify-Dashboard → **Forms** (linkes Menü) → **Enable form detection**
2. Einmal neu veröffentlichen: **Deploys → Trigger deploy → Deploy site**
   (nötig, damit Netlify das Formular „kontakt" erkennt)
3. E-Mail-Benachrichtigung einrichten:
   **Site configuration → Notifications → Form submission notifications →
   Add notification → Email notification** → E-Mail: **info@kruckenhaus.at**
4. **Testen:** Auf der Website selbst eine Testanfrage über das Kontaktformular
   schicken und prüfen, ob sie per E-Mail ankommt (auch im Spam-Ordner nachsehen).

Alle Einsendungen sind zusätzlich jederzeit im Netlify-Dashboard unter
**Forms** nachlesbar. Der Gratis-Plan erlaubt 100 Einsendungen pro Monat.

---

## Schritt 3: Airbnb-Kalender verbinden (ca. 5 Min.)

Damit zeigt die Website automatisch an, wann die Wohnung belegt ist.

1. Bei **Airbnb** einloggen → Kalender der Ferienwohnung öffnen →
   **Verfügbarkeit → Kalender verknüpfen → Kalender exportieren** →
   den angezeigten Link kopieren (endet auf `.ics?s=…`)
   ⚠️ Dieser Link ist geheim – nirgends veröffentlichen!
2. In Netlify: **Site configuration → Environment variables → Add a variable**
   - **Key:** `AIRBNB_ICAL_URL`
   - **Value:** der kopierte Link
3. **Deploys → Trigger deploy → Deploy site**
4. **Testen:** Auf der Website unter „Ferienwohnung → Verfügbarkeit & Buchung"
   müssen die in Airbnb belegten Tage durchgestrichen erscheinen
   (Aktualisierung kann bis zu 1 Stunde + Airbnb-Verzögerung dauern).

**Wichtig im Alltag:** Der Abgleich läuft nur in eine Richtung
(Airbnb → Website). Wenn ihr eine Anfrage über die Website bestätigt, müsst
ihr die Tage **selbst im Airbnb-Kalender blockieren**. Kommt später
Booking.com dazu: dessen iCal-Link einfach per Komma an die Variable anhängen.

---

## Schritt 4: Domain kruckenhaus.at verbinden (ca. 15 Min. + Wartezeit)

### 4a. Domain in Netlify eintragen

1. Netlify: **Domain management → Add a domain** → `kruckenhaus.at` eingeben
2. Netlify zeigt an, welche DNS-Einträge nötig sind (sollten den unten genannten entsprechen)

### 4b. DNS-Einträge bei world4you setzen

1. Im [world4you-Kundencenter](https://my.world4you.com) einloggen
2. **Meine Domains → kruckenhaus.at → DNS-Verwaltung** (bzw. „Nameserver-Einträge bearbeiten")
3. Zwei Einträge setzen bzw. ändern:

| Typ | Name/Host | Wert |
|---|---|---|
| **A** | `@` (bzw. leer = kruckenhaus.at) | `75.2.60.5` |
| **CNAME** | `www` | `IHRSITENAME.netlify.app` (eure Netlify-Adresse aus Schritt 1) |

> ⚠️ **E-Mail nicht kaputt machen:** Falls eure Postfächer (info@kruckenhaus.at)
> bei world4you liegen, die **MX-Einträge unverändert lassen** und nur die
> A-/CNAME-Einträge für die Website ändern. Im Zweifel vorher einen Screenshot
> der bestehenden Einträge machen oder den world4you-Support fragen.

4. Warten: DNS-Änderungen brauchen zwischen einigen Minuten und ein paar
   Stunden (selten bis 24 h).

### 4c. HTTPS aktivieren

Sobald die Domain auf Netlify zeigt, stellt Netlify unter
**Domain management → HTTPS** automatisch ein kostenloses SSL-Zertifikat aus
(Let's Encrypt). Prüfen: `https://www.kruckenhaus.at` muss mit Schloss-Symbol laden.

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
| Airbnb-/Booking-Kalenderlinks | Netlify-Umgebungsvariable `AIRBNB_ICAL_URL` |

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
├── kontakt.html             → Kontaktformular (Netlify Forms)
├── impressum.html           → Impressum (§ 5 ECG, § 25 MedienG, UID)
├── datenschutz.html         → Datenschutzerklärung (DSGVO)
├── netlify.toml             → Netlify-Konfiguration (nicht löschen!)
├── sitemap.xml / robots.txt → Für Google & Co.
├── css/style.css            → Design (Farben, Schriften, Layout)
├── js/main.js               → Navigation, Formular, Animationen
├── js/verfuegbarkeit.js     → Belegungskalender (Anzeige)
├── js/preise-config.js      → ALLE Preise zentral
├── netlify/functions/availability.js → Holt den Airbnb-Kalender (Server)
├── fonts/                   → Lokal gehostete Schriften (DSGVO – nicht löschen!)
└── images/                  → Fotos (siehe Schritt 5)
```

---

## Technische Hinweise

- **Schriften bleiben lokal:** Die Schriftarten liegen bewusst im Ordner
  `/fonts/` statt bei Google (DSGVO). Bei Design-Änderungen beibehalten.
- **Kein Tracking:** Es ist absichtlich kein Google Analytics o. Ä. eingebaut.
  Besucherzahlen DSGVO-freundlich nachrüsten: Netlify Analytics (kostenpflichtig)
  oder z. B. Plausible/Fathom.
- **Lokal testen** (optional): Im Projektordner `python3 -m http.server 8080`
  ausführen und `http://localhost:8080` öffnen. Formular und Kalender
  funktionieren nur auf Netlify, nicht lokal.
- **Buchungssystem-Upgrade:** Bei mehr Buchungsvolumen kann ein Channel Manager
  (Smoobu, DiBooq, Feratel) den Kalender ersetzen – dessen Widget kommt dann in
  den `<div id="booking-widget">` auf `ferienwohnung.html` und `preise.html`.

---

*Hof Kruckenhaus – Kathrin & Florian Häusler, Oberberg 70, 6252 Breitenbach am Inn*
