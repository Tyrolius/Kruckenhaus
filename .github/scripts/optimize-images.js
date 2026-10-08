#!/usr/bin/env node
/**
 * Verkleinert und komprimiert Fotos in images/ auf Web-taugliche Maße.
 *
 * Zielwerte (siehe README, Schritt 5):
 *   – maximale Breite:      1600 px (Querformat)
 *   – maximale Dateigröße:  ~300 KB
 *
 * Bilder, die diese Werte bereits einhalten, werden NICHT angefasst –
 * wiederholtes Neukomprimieren würde bei JPEGs nur Qualität kosten, ohne
 * etwas zu gewinnen. Dadurch ist das Skript gefahrlos mehrfach ausführbar
 * und verändert bei unveränderten Bildern nichts (wichtig, damit der
 * GitHub-Actions-Workflow keine leeren Commits erzeugt).
 *
 * Ausgenommen: Markenbilder, die exakte Maße oder Transparenz brauchen.
 *
 * Zusätzlich entsteht images/fotos.json – die Liste aller Fotos. Die
 * Hofladen-Verwaltung bietet daraus die Produktfotos zur Auswahl an
 * (eine statische Website kann keinen Ordner auflisten).
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGES_DIR = path.join(__dirname, '..', '..', 'images');
const MAX_WIDTH = 1600;
const MAX_BYTES = 300 * 1024;
const JPEG_QUALITY_STEPS = [82, 75, 68, 60, 52];

// Dateinamen (ohne Pfad), die nie automatisch verändert werden sollen.
const EXCLUDE = new Set(['logo.png', 'favicon.png']);

// Liste für die Foto-Auswahl der Verwaltung; Logos gehören nicht hinein
const FOTOLISTE = path.join(IMAGES_DIR, 'fotos.json');
const NICHT_IN_LISTE = /^logo\//;

function listImageFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listImageFiles(full);
    if (EXCLUDE.has(entry.name)) return [];
    if (/\.(jpe?g|png)$/i.test(entry.name)) return [full];
    return [];
  });
}

async function optimizeJpeg(buffer, needsResize) {
  let best = null;
  for (const quality of JPEG_QUALITY_STEPS) {
    const out = await sharp(buffer)
      .rotate() // EXIF-Ausrichtung übernehmen, Tag danach entfernen
      .resize(needsResize ? { width: MAX_WIDTH, withoutEnlargement: true } : undefined)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    best = out;
    if (out.length <= MAX_BYTES) break;
  }
  return best;
}

async function optimizePng(buffer, needsResize) {
  // PNG wird verlustfrei komprimiert (kein Qualitätsverlust) – für Fotos
  // ist JPEG die bessere Wahl, PNG kommt meist nur bei Grafiken vor.
  return sharp(buffer)
    .rotate()
    .resize(needsResize ? { width: MAX_WIDTH, withoutEnlargement: true } : undefined)
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log('images/ existiert nicht – nichts zu tun.');
    return;
  }

  const files = listImageFiles(IMAGES_DIR);
  let changed = 0;

  for (const file of files) {
    const original = fs.readFileSync(file);
    const meta = await sharp(original).metadata();
    const needsResize = (meta.width ?? 0) > MAX_WIDTH;
    const alreadyFine = !needsResize && original.length <= MAX_BYTES;

    if (alreadyFine) continue;

    const isPng = /\.png$/i.test(file);
    const optimized = isPng
      ? await optimizePng(original, needsResize)
      : await optimizeJpeg(original, needsResize);

    // Nur schreiben, wenn es sich lohnt (mind. 5 % kleiner oder verkleinert).
    // Fotos mit viel Struktur (Wiese) bleiben auch bei niedriger Qualität über
    // 300 KB – ohne diese Schwelle würden sie bei jedem Lauf minimal neu
    // komprimiert, verlören jedes Mal Qualität und erzeugten einen Commit.
    if (optimized && (needsResize || optimized.length < original.length * 0.95)) {
      fs.writeFileSync(file, optimized);
      changed++;
      console.log(
        `optimiert: ${path.relative(IMAGES_DIR, file)} ` +
          `(${(original.length / 1024).toFixed(0)} KB -> ${(optimized.length / 1024).toFixed(0)} KB)`
      );
    }
  }

  console.log(
    changed === 0
      ? 'Alle Bilder sind bereits web-tauglich – nichts zu tun.'
      : `${changed} Bild(er) optimiert.`
  );

  fotolisteSchreiben(files);
}

// Schreibt images/fotos.json nur, wenn sich die Liste geändert hat –
// sonst entstünde bei jedem Lauf ein leerer Commit.
function fotolisteSchreiben(files) {
  const liste = files
    .map((f) => path.relative(IMAGES_DIR, f).split(path.sep).join('/'))
    .filter((f) => !NICHT_IN_LISTE.test(f))
    .sort((a, b) => a.localeCompare(b, 'de'))
    .map((f) => `images/${f}`);
  const neu = `${JSON.stringify(liste, null, 2)}\n`;
  const alt = fs.existsSync(FOTOLISTE) ? fs.readFileSync(FOTOLISTE, 'utf8') : '';
  if (neu !== alt) {
    fs.writeFileSync(FOTOLISTE, neu);
    console.log(`Fotoliste aktualisiert: ${liste.length} Fotos in images/fotos.json`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
