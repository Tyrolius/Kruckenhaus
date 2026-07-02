# Kruckenhaus – Ferienwohnung Website

Offizielle Website der Ferienwohnung **Hof Kruckenhaus** in Breitenbach am Inn, Tirol, Österreich.

**Domain:** [kruckenhaus.at](https://www.kruckenhaus.at)
**Hosting:** Netlify (statische Website)
**Stack:** Vanilla HTML5, CSS3, JavaScript (kein Framework)

---

## Dateistruktur

```
/
├── index.html              → Startseite
├── ferienwohnung.html      → Die Wohnung (Galerie, Ausstattung)
├── lage.html               → Lage & Umgebung, Aktivitäten
├── preise.html             → Preise & Buchung
├── kontakt.html            → Kontaktformular
├── datenschutz.html        → Datenschutzerklärung (noch zu erstellen)
├── impressum.html          → Impressum (noch zu erstellen)
├── netlify.toml            → Netlify-Konfiguration
├── css/
│   └── style.css           → Globales Stylesheet
├── js/
│   └── main.js             → JavaScript (Navigation, Animationen etc.)
├── images/
│   └── .gitkeep            → Platzhalter (Fotos hier einfügen)
└── README.md               → Diese Anleitung
```

---

## 1. Fotos einfügen

Alle Fotos kommen in den Ordner **`images/`**. Folgende Dateinamen werden erwartet:

| Dateiname                   | Beschreibung                        | Empfohlene Größe |
|-----------------------------|-------------------------------------|------------------|
| `hero-background.jpg`       | Startseite-Hero-Bild (Panorama)     | 1920 × 1080 px   |
| `wohnung-aussen.jpg`        | Außenansicht des Hofs               | 1200 × 800 px    |
| `wohnung-wohnzimmer.jpg`    | Wohnzimmer                          | 1200 × 800 px    |
| `wohnung-schlafzimmer.jpg`  | Schlafzimmer                        | 1200 × 800 px    |
| `wohnung-kueche.jpg`        | Küche                               | 1200 × 800 px    |
| `wohnung-bad.jpg`           | Badezimmer                          | 1200 × 800 px    |
| `wohnung-terrasse.jpg`      | Terrasse mit Bergblick              | 1200 × 800 px    |
| `umgebung-berge.jpg`        | Tiroler Berglandschaft              | 1200 × 800 px    |
| `umgebung-dorf.jpg`         | Breitenbach am Inn / Umgebung       | 1200 × 800 px    |
| `grundriss.jpg`             | Grundriss der Ferienwohnung         | 1200 × 800 px    |

**Tipps zur Bildoptimierung:**
- Bilder vor dem Upload komprimieren (z. B. [Squoosh](https://squoosh.app) oder [TinyPNG](https://tinypng.com))
- Zielgröße: < 300 KB pro Bild für schnelle Ladezeiten
- Format: JPEG für Fotos, WebP für beste Performance (optional)
- Das Hero-Hintergrundbild wird auch auf Unterseiten als Page-Hero verwendet

---

## 2. Verfügbarkeitskalender (Airbnb-Sync) aktivieren

Auf `ferienwohnung.html#buchung` zeigt ein Kalender die belegten Zeiträume an.
Die Daten kommen automatisch aus dem Airbnb-Kalender (iCal-Export) über die
Netlify Function `netlify/functions/availability.js`. Solange keine iCal-URL
hinterlegt ist, zeigt die Seite einen freundlichen Hinweis statt des Kalenders.

**Einrichtung (einmalig, ca. 5 Minuten):**

1. Airbnb-iCal-Link holen: Bei Airbnb einloggen →
   **Kalender → Verfügbarkeit → Kalender verknüpfen → Kalender exportieren**
   → den angezeigten Link kopieren (endet auf `.ics?s=…`).
   ⚠️ Dieser Link enthält ein Geheimnis – nicht öffentlich teilen, nicht in
   den Code schreiben.
2. In Netlify: **Site configuration → Environment variables → Add a variable**
   - Key: `AIRBNB_ICAL_URL`
   - Value: der kopierte Link (mehrere Kalender mit Komma trennen)
3. Site neu deployen (**Deploys → Trigger deploy**), damit die Variable greift.

**Hinweise:**
- Airbnb aktualisiert den iCal-Export mit Verzögerung (bis zu einigen Stunden);
  zusätzlich cached die Function das Ergebnis 1 Stunde.
- Direktbuchungen über die Website müssen weiterhin **manuell im
  Airbnb-Kalender geblockt** werden (der Sync läuft nur Airbnb → Website).
- Später ist ein Umstieg auf einen Channel Manager mit echter Online-Buchung
  und Zwei-Wege-Sync möglich (z. B. Smoobu, DiBooq, Feratel); dessen Widget
  ersetzt dann den Inhalt von `<div id="booking-widget">` in
  `ferienwohnung.html`.

---

## 3. Texte anpassen

### Kontaktdaten aktualisieren
Suchen und ersetzen Sie in **allen HTML-Dateien** folgende Platzhalter:

| Platzhalter                    | Ersetzen durch                         |
|--------------------------------|----------------------------------------|
| `[Nachname]`                   | Ihren echten Nachnamen                 |
| `info@kruckenhaus.at`          | Ihre echte E-Mail-Adresse              |
| `+43 ... (Platzhalter)`        | Ihre echte Telefonnummer               |
| `https://wa.me/43000000000`    | Ihre WhatsApp-Nummer                   |

### Preise anpassen
In `preise.html` finden Sie die Preistabelle. Passen Sie folgende Werte an:
- `ab €150` → Ihre Hauptsaison-Preise
- `ab €120` → Ihre Nebensaison-Preise
- `€80` → Ihre Endreinigungsgebühr
- `€2,80` → Aktuelle Ortstaxe Breitenbach am Inn (bei Gemeinde erfragen)

### Social Media Links
In allen Footern (index.html, ferienwohnung.html, lage.html, preise.html, kontakt.html):
```html
<a href="#" class="social-link" aria-label="Facebook">📘</a>
<a href="#" class="social-link" aria-label="Instagram">📷</a>
```
Ersetzen Sie `#` durch Ihre echten Social-Media-URLs.

---

## 4. Google Maps einbinden

In `lage.html` und `kontakt.html` finden Sie Karten-Platzhalter. So binden Sie die echte Karte ein:

1. Gehen Sie zu [Google Maps](https://maps.google.com)
2. Suchen Sie nach `Oberberg 70, 6252 Breitenbach am Inn`
3. Klicken Sie auf **Teilen → Karte einbetten**
4. Kopieren Sie den `<iframe>`-Code
5. Ersetzen Sie den `<div class="map-placeholder">...</div>` durch den iFrame

**Hinweis (DSGVO):** Für die DSGVO-konforme Einbindung empfehlen wir ein Consent-Tool oder eine 2-Klick-Lösung. Alternativ: OpenStreetMap über [OpenStreetMap.org](https://www.openstreetmap.org) (keine Google-Daten).

---

## 5. Alpaka-Seite später hinzufügen

Die Website ist für die spätere Erweiterung vorbereitet. So gehen Sie vor:

### Schritt 1: Neue Seite erstellen
Erstellen Sie eine Datei `alpakas.html` analog zu den bestehenden Unterseiten.
Kopieren Sie die Struktur aus `ferienwohnung.html` als Vorlage.

### Schritt 2: Navigation erweitern
Suchen Sie in **allen HTML-Dateien** den Kommentar:
```html
<!-- Alpakas-Link kommt später -->
```
Ersetzen Sie ihn durch:
```html
<a href="alpakas.html" class="nav-link">Alpakas</a>
```

### Schritt 3: CSS-Klasse aktivieren
In `css/style.css` ist die Klasse `.alpaka-section` bereits definiert:
```css
.alpaka-section {
  display: none; /* Auf 'block' oder 'flex' setzen zum Aktivieren */
}
```
Ändern Sie `display: none` zu `display: block`.

### Schritt 4: Bilder hinzufügen
Fügen Sie Alpaka-Fotos in `images/` ein, z. B. `alpaka-wiese.jpg`, `alpaka-portrait.jpg` etc.

---

## 6. Deployment zu Netlify

### Ersteinrichtung

1. **GitHub Repository erstellen** (bereits erledigt: `Tyrolius/Kruckenhaus`)
2. Gehen Sie zu [netlify.com](https://www.netlify.com) und melden Sie sich an
3. Klicken Sie auf **"Add new site" → "Import an existing project"**
4. Verbinden Sie Ihr GitHub-Konto und wählen Sie das Repository `Tyrolius/Kruckenhaus`
5. Build-Einstellungen:
   - **Branch:** `main` (oder `master`)
   - **Build command:** *(leer lassen)*
   - **Publish directory:** `.`
6. Klicken Sie auf **"Deploy site"**

### Eigene Domain verbinden

1. In Netlify: **Site settings → Domain management → Add custom domain**
2. Geben Sie `kruckenhaus.at` ein
3. Folgen Sie den DNS-Anweisungen (CNAME oder A-Record bei Ihrem Domain-Anbieter)
4. Netlify erstellt automatisch ein kostenloses SSL-Zertifikat (Let's Encrypt)

### Automatische Deployments

Nach der Einrichtung: Jeder `git push` auf den `main`-Branch löst automatisch ein neues Deployment aus!

```bash
# Änderungen deployen
git add .
git commit -m "Beschreibung der Änderung"
git push origin main
```

---

## 7. Netlify Forms (Kontaktformular)

Das Kontaktformular in `kontakt.html` ist bereits für **Netlify Forms** vorbereitet:
- `data-netlify="true"` Attribut ist gesetzt
- Spam-Schutz (Honeypot) ist integriert

Nach dem ersten Deployment in Netlify (einmalig):
1. **Forms aktivieren:** Netlify-Dashboard → **Forms → Enable form detection**,
   danach einmal neu deployen, damit das Formular „kontakt" erkannt wird
2. Formulareinsendungen erscheinen dann unter **Forms** im Dashboard
3. **E-Mail-Benachrichtigung einrichten:** Site configuration → **Notifications →
   Form submission notifications → Add notification → Email notification** →
   als Empfänger `info@kruckenhaus.at` eintragen
4. Testanfrage über die Website senden und prüfen, ob die E-Mail ankommt

Hinweis: Der kostenlose Netlify-Plan umfasst 100 Formular-Einsendungen pro
Monat – für Buchungsanfragen mehr als ausreichend.

---

## 8. Datenschutz & Impressum

Beide Seiten sind vorhanden und inhaltlich ausgearbeitet (Stand Juli 2026):
- `impressum.html` – § 5 ECG, Offenlegung § 25 MedienG, Verbraucherstreitbeilegung
- `datenschutz.html` – DSGVO/DSG inkl. Netlify, WhatsApp, Gästemeldung, OpenStreetMap

Die Schriftarten werden **lokal gehostet** (Ordner `/fonts/`), es findet kein
Abruf von Google-Servern statt – bitte bei künftigen Design-Änderungen beibehalten.

**Vor dem Livegang prüfen (keine Rechtsberatung durch diese Vorlage!):**
- Texte einmal von der WKO Tirol / einem Anwalt gegenlesen lassen
- Aktuellen Ortstaxe-Satz bei der Gemeinde Breitenbach bestätigen

**Mindestangaben für das Impressum (§ 5 ECG Österreich):**
- Name und Anschrift
- E-Mail-Adresse
- Umsatzsteuer-Identifikationsnummer (falls vorhanden)
- Gewerbebehörde (falls gewerblich)

---

## 9. Lokale Entwicklung

Um die Website lokal zu testen:

```bash
# Option 1: Python (meist vorinstalliert)
python3 -m http.server 8080

# Option 2: Node.js (npx)
npx serve .

# Option 3: VS Code Live Server Extension
# Installieren und mit Rechtsklick → "Open with Live Server" starten
```

Dann im Browser öffnen: `http://localhost:8080`

---

## 10. Häufige Anpassungen (Schnellreferenz)

| Was ändern?          | Wo?                              | Suchen nach                   |
|----------------------|----------------------------------|-------------------------------|
| Preise               | `preise.html`                    | `ab €120`, `ab €150`          |
| Telefonnummer        | Alle HTML-Dateien                | `+43 ...`                     |
| E-Mail               | Alle HTML-Dateien                | `info@kruckenhaus.at`         |
| Nachnamen            | Alle HTML-Dateien                | `Florian & Kathrin`           |
| Farbschema           | `css/style.css`                  | `:root { --color-...`         |
| Hauptbild (Hero)     | `images/hero-background.jpg`     | Datei ersetzen                |
| Copyright-Jahr       | Footer aller HTML-Dateien        | `© 2025`                      |
| Navigation erweitern | Alle HTML-Dateien                | `<!-- Alpakas-Link kommt...`  |

---

## Technische Details

- **Browser-Kompatibilität:** Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **Performance:** Keine externen JS-Abhängigkeiten, minimales CSS
- **SEO:** Meta-Tags, Open Graph, Schema.org auf Kontaktseite
- **Accessibility:** ARIA-Labels, semantisches HTML, Tastaturnavigation
- **DSGVO:** Cookie-Banner, Datenschutzhinweis im Formular, kein Tracking standardmäßig

---

*Hof Kruckenhaus – Breitenbach am Inn, Tirol, Österreich*
*Website erstellt mit Vanilla HTML/CSS/JS | Hosting: Netlify*
