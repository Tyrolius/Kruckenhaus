# Kruckenhaus – Arbeitsregeln

## Grundregeln

Du arbeitest an einer statischen Website ohne Build-Schritt. Header und Footer
sind in allen HTML-Dateien dupliziert – Änderungen daran müssen in allen Dateien
identisch gemacht werden. Kein Framework, kein npm, keine neuen Abhängigkeiten.
Nach jeder Änderung: `grep` über alle HTML-Dateien, ob die Änderung wirklich
überall angekommen ist. Erkläre mir am Ende in zwei Sätzen, was du geändert hast.

## Arbeitsweise

Eine Sitzung = ein Thema = ein Commit. Themen nicht vermischen – wenn eine
Änderung schiefgeht, soll der Rückschritt klein bleiben.

## Lokal ansehen

```
npx wrangler pages dev .     # mit Functions (/api/kontakt, /api/availability)
python3 -m http.server 8080  # reicht zum reinen Anschauen
```

## Was wo liegt

| Thema | Datei |
|---|---|
| Alle Preise (einzige Quelle) | `js/preise-config.js` |
| Design, Farben, Schriften | `css/style.css` |
| Navigation, Formular, Animationen | `js/main.js` |
| Belegungskalender | `js/verfuegbarkeit.js`, `functions/api/availability.js` |
| Kontaktformular (D1 + E-Mail) | `functions/api/kontakt.js` |
| Angebotsübersicht für KI-Systeme | `llms.txt` |

## Stolperfallen

- **Preise stehen an drei Stellen**: `js/preise-config.js`, der `makesOffer`-Block
  im JSON-LD von `index.html` und `llms.txt`. Bei Preisänderungen alle drei
  anfassen.
- **FAQ steht zweimal in `kontakt.html`**: sichtbar als `<details>` und im
  FAQ-Markup im `<head>`. Google verlangt, dass beide übereinstimmen.
- **`impressum.html`, `datenschutz.html` und `404.html` sind `noindex`** und
  gehören deshalb nicht in `sitemap.xml` – eine Sitemap, die auf noindex-Seiten
  zeigt, sendet widersprüchliche Signale.
- **Bilder nicht vorab komprimieren** – das erledigt der GitHub-Workflow
  `.github/workflows/optimize-images.yml` automatisch.
- **Schriften liegen lokal in `/fonts/`** (DSGVO). Keine Google-Fonts-CDN
  einbinden.

## Nach Textänderungen an Seiten

```
node scripts/sitemap-lastmod.js
```

Trägt die Änderungsdaten in `sitemap.xml` nach. Mit `--check` nur prüfen.
