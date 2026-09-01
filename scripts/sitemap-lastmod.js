#!/usr/bin/env node
/**
 * sitemap-lastmod.js – hält die <lastmod>-Daten in sitemap.xml aktuell.
 *
 * Warum es das gibt: <lastmod> von Hand zu pflegen geht zuverlässig schief.
 * Google wertet die Angabe nur aus, wenn sie glaubwürdig ist – pauschale oder
 * sprunghafte Daten ignoriert es. Das Skript liest deshalb das echte Datum
 * jeder Seite aus der Git-Historie, statt es zu raten.
 *
 * Regel je Seite:
 *   - Datei hat ungespeicherte Änderungen  → heutiges Datum
 *   - sonst                                → Datum des letzten Commits
 *
 * Aufruf (im Repo-Ordner):
 *   node scripts/sitemap-lastmod.js           schreibt die Änderungen
 *   node scripts/sitemap-lastmod.js --check   zeigt nur, was veraltet ist
 *
 * Keine Abhängigkeiten – nur Node-Standardbibliothek.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const SITEMAP = path.join(REPO, 'sitemap.xml');
const checkOnly = process.argv.includes('--check');

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
}

function heute() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Übersetzt eine URL aus der Sitemap in den Dateinamen im Repo.
 * "https://www.kruckenhaus.at/"            -> "index.html"
 * "https://www.kruckenhaus.at/lage.html"   -> "lage.html"
 */
function urlZuDatei(loc) {
  let pfad;
  try {
    pfad = new URL(loc).pathname;
  } catch {
    return null;
  }
  pfad = pfad.replace(/^\/+/, '');
  if (pfad === '' || pfad.endsWith('/')) pfad += 'index.html';
  return pfad;
}

/** Letztes Änderungsdatum einer Datei – ungespeicherte Änderungen zählen als heute. */
function datumFuer(datei) {
  const abs = path.join(REPO, datei);
  if (!fs.existsSync(abs)) return null;

  // Ungespeichert oder noch nicht eingecheckt? Dann ist heute der Stand.
  if (git(['status', '--porcelain', '--', datei]) !== '') return heute();

  const commitDatum = git(['log', '-1', '--format=%ad', '--date=short', '--', datei]);
  return commitDatum || heute();
}

function main() {
  if (!fs.existsSync(SITEMAP)) {
    console.error('Fehler: sitemap.xml nicht gefunden.');
    process.exit(1);
  }

  const original = fs.readFileSync(SITEMAP, 'utf8');
  const geaendert = [];
  const probleme = [];

  // Ersetzt nur den Datumswert und lässt Einrückung und Reihenfolge unangetastet.
  const neu = original.replace(
    /<loc>\s*(.*?)\s*<\/loc>(\s*)<lastmod>\s*(.*?)\s*<\/lastmod>/g,
    (treffer, loc, zwischenraum, altesDatum) => {
      const datei = urlZuDatei(loc);
      if (!datei) {
        probleme.push(`${loc} – unlesbare URL, unverändert gelassen`);
        return treffer;
      }
      const neuesDatum = datumFuer(datei);
      if (!neuesDatum) {
        probleme.push(`${datei} – Datei fehlt im Repo, Datum unverändert gelassen`);
        return treffer;
      }
      if (neuesDatum !== altesDatum) {
        geaendert.push({ datei, alt: altesDatum, neu: neuesDatum });
      }
      return `<loc>${loc}</loc>${zwischenraum}<lastmod>${neuesDatum}</lastmod>`;
    }
  );

  for (const p of probleme) console.warn(`Hinweis: ${p}`);

  if (geaendert.length === 0) {
    console.log('sitemap.xml ist aktuell – nichts zu tun.');
    return;
  }

  const breite = Math.max(...geaendert.map((g) => g.datei.length));
  for (const g of geaendert) {
    console.log(`${g.datei.padEnd(breite)}  ${g.alt} -> ${g.neu}`);
  }

  if (checkOnly) {
    console.log(`\n${geaendert.length} Eintrag/Einträge veraltet (--check: nichts geschrieben).`);
    process.exit(1);
  }

  fs.writeFileSync(SITEMAP, neu, 'utf8');
  console.log(`\n${geaendert.length} Eintrag/Einträge in sitemap.xml aktualisiert.`);
}

main();
