/* ============================================================
 * FREILANDEIER – gemeinsame Helfer (keine Route)
 * ============================================================
 * Anmeldung als Eierkunde (Formular auf freilandeier.html), „Aktuelles
 * vom Stall" und die Schnittstelle der Verwaltung dafür. Genutzt von:
 *   functions/api/eier/[[pfad]].js        öffentlich: Anmeldung, Neuigkeiten
 *   functions/api/verwaltung/[[pfad]].js  leitet /api/verwaltung/eier/… hierher
 *
 * Die Kundenverwaltung selbst läuft in Bertha. Diese Liste ist nur der
 * Eingang: angenommene Anmeldungen legt der Hof von Hand in Bertha an
 * (CSV-Export) – bewusst keine automatische Übergabe.
 *
 * Tabellen: eier_anmeldungen, stall_neuigkeiten (schema-eier.sql).
 * Bewusst ohne IP-Adresse und Browserkennung.
 * ============================================================ */

import { json, EingabeFehler, istGueltigeEmail, escapeHtml } from './hofladen.js';
import { BETRIEB, mailHtml, absatz, klein, kasten, gruss } from './mail.js';

/* ------------------------------------------------------------
   1. AUSWAHLWERTE
   Gleiche Schlüssel wie in freilandeier.html und verwaltung/eier.js.
   ------------------------------------------------------------ */
export const STATUS = {
  neu: 'Neu',
  warteliste: 'Warteliste',
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
};
export const RHYTHMUS = { woechentlich: 'wöchentlich', '14-taegig': '14-tägig' };
export const ABSTELLORTE = {
  haustuer: 'vor der Haustür',
  garage: 'in der Garage / im Carport',
  persoenlich: 'persönlich übergeben',
  anderer: 'anderer Ort',
};
export const HERKUNFT = {
  empfehlung: 'Empfehlung',
  internet: 'Internet / Website',
  hof: 'am Hof / bei uns gekauft',
  anderes: 'anderes',
};
export const MAX_SCHACHTELN = 10;

// Liefergebiet nach Postleitzahl. Brixlegg beliefern wir derzeit nicht,
// könnten es aber dazunehmen – deshalb eigene Stufe statt „außerhalb".
const GEBIET = {
  6233: 'Kramsach',
  6250: 'Kundl',
  6252: 'Breitenbach am Inn',
};
const GEBIET_MOEGLICH = { 6230: 'Brixlegg' };

export function liefergebiet(plz) {
  const p = String(plz || '').trim();
  if (GEBIET[p]) return 'ja';
  if (GEBIET_MOEGLICH[p]) return 'moeglich';
  return 'nein';
}
export const GEBIET_TEXT = { ja: 'im Liefergebiet', moeglich: 'Brixlegg (könnten wir dazunehmen)', nein: 'außerhalb des Liefergebiets' };

/* ------------------------------------------------------------
   2. ANMELDUNG PRÜFEN
   Liefert die bereinigten Daten oder wirft EingabeFehler mit einem
   Text, der so im Formular angezeigt werden kann.
   ------------------------------------------------------------ */
const text = (wert, max = 200) => String(wert ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const angehakt = (wert) => wert === true || wert === 'on' || wert === 'true' || wert === '1' || wert === 1;

export function anmeldungPruefen(eingabe) {
  const e = eingabe || {};
  const d = {
    name: text(e.name, 100),
    strasse: text(e.strasse, 150),
    plz: text(e.plz, 10),
    ort: text(e.ort, 80),
    telefon: text(e.telefon, 40),
    email: text(e.email, 200).toLowerCase(),
    schachteln: Number(e.schachteln),
    rhythmus: text(e.rhythmus, 20),
    abstellort: text(e.abstellort, 20),
    abstellortHinweis: text(e.abstellortHinweis, 300),
    herkunft: text(e.herkunft, 20),
    empfohlenVon: text(e.empfohlenVon, 100),
    neuigkeiten: angehakt(e.neuigkeiten),
  };

  if (d.name.length < 2) throw new EingabeFehler('Bitte gebt euren Namen an.');
  if (!d.strasse) throw new EingabeFehler('Bitte gebt Straße und Hausnummer an.');
  if (!/^\d{4}$/.test(d.plz)) throw new EingabeFehler('Bitte gebt eine gültige Postleitzahl an (4 Ziffern).');
  if (!d.ort) throw new EingabeFehler('Bitte gebt euren Ort an.');
  if ((d.telefon.match(/\d/g) || []).length < 6 || !/^[+\d\s/()-]+$/.test(d.telefon)) {
    throw new EingabeFehler('Bitte gebt eine gültige Telefonnummer an.');
  }
  if (!istGueltigeEmail(d.email)) throw new EingabeFehler('Bitte gebt eine gültige E-Mail-Adresse an.');
  if (!Number.isInteger(d.schachteln) || d.schachteln < 1 || d.schachteln > MAX_SCHACHTELN) {
    throw new EingabeFehler(`Bitte wählt, wie viele Schachteln ihr pro Lieferung möchtet (1 bis ${MAX_SCHACHTELN}).`);
  }
  if (!RHYTHMUS[d.rhythmus]) throw new EingabeFehler('Bitte wählt wöchentlich oder 14-tägig.');
  if (!ABSTELLORTE[d.abstellort]) throw new EingabeFehler('Bitte wählt, wo wir die Eier abstellen dürfen.');
  if (d.abstellort === 'anderer' && !d.abstellortHinweis) {
    throw new EingabeFehler('Bitte beschreibt kurz, wo wir die Eier abstellen dürfen.');
  }
  if (d.herkunft && !HERKUNFT[d.herkunft]) throw new EingabeFehler('Ungültige Auswahl bei „Wie habt ihr von uns erfahren?".');
  if (d.herkunft !== 'empfehlung') d.empfohlenVon = '';
  if (!angehakt(e.datenschutz)) {
    throw new EingabeFehler('Bitte bestätigt, dass ihr den Datenschutzhinweis gelesen habt.');
  }
  return d;
}

/* ------------------------------------------------------------
   3. ANMELDUNG SPEICHERN UND MAILS
   ------------------------------------------------------------ */
export async function anmeldungSpeichern(db, d) {
  const r = await db.prepare(
    `INSERT INTO eier_anmeldungen
       (name, strasse, plz, ort, telefon, email, schachteln, rhythmus, abstellort, abstellort_hinweis,
        herkunft, empfohlen_von, neuigkeiten, neuigkeiten_seit, datenschutz_am)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') END, datetime('now'))
     RETURNING id`
  ).bind(
    d.name, d.strasse, d.plz, d.ort, d.telefon, d.email, d.schachteln, d.rhythmus, d.abstellort,
    d.abstellortHinweis || null, d.herkunft || null, d.empfohlenVon || null,
    d.neuigkeiten ? 1 : 0, d.neuigkeiten ? 1 : 0
  ).first();
  return r && r.id;
}

const mengeText = (d) => `${d.schachteln} ${d.schachteln === 1 ? 'Schachtel' : 'Schachteln'}, ${RHYTHMUS[d.rhythmus]}`;
const abstellText = (d) => `${ABSTELLORTE[d.abstellort]}${d.abstellortHinweis ? ` – ${d.abstellortHinweis}` : ''}`;

// Benachrichtigung an den Hof: alle Angaben, Antwort geht direkt an den Interessenten
export function hofMail(d) {
  const gebiet = liefergebiet(d.plz);
  const zeilen = [
    ['Name', d.name],
    ['Adresse', `${d.strasse}, ${d.plz} ${d.ort}`],
    ['Liefergebiet', GEBIET_TEXT[gebiet]],
    ['Telefon', d.telefon],
    ['E-Mail', d.email],
    ['Menge', mengeText(d)],
    ['Abstellort', abstellText(d)],
    ['Erfahren über', d.herkunft ? HERKUNFT[d.herkunft] + (d.empfohlenVon ? ` (${d.empfohlenVon})` : '') : '–'],
    ['Neuigkeiten vom Hof', d.neuigkeiten ? 'ja' : 'nein'],
  ];
  const tabelle = zeilen
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:700;vertical-align:top">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join('');
  const html = mailHtml({
    art: 'hof',
    titel: 'Neue Anmeldung als Eierkunde',
    inhalt:
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${tabelle}</table>` +
      absatz('Status in der Verwaltung: <strong>neu</strong>. Dort auf Warteliste setzen, annehmen oder ablehnen und für Bertha als CSV exportieren.'),
  });
  return { betreff: `Neue Eier-Anmeldung: ${d.name} (${d.ort})`, html };
}

// Bestätigung an den Interessenten. Enthält nur Vorname-Kürzung, Ort, Menge
// und Rhythmus – keine frei eingegebenen Texte (Hinweise, Empfehlung), damit
// niemand über unseren Absender eigene Inhalte an fremde Adressen schickt.
export function bestaetigungMail(d) {
  const name = d.name.slice(0, 60);
  const html = mailHtml({
    titel: 'Eure Anmeldung als Eierkunde ist angekommen',
    vorschau: 'Danke! Wir melden uns persönlich bei euch.',
    inhalt:
      absatz(`Hallo ${escapeHtml(name)},`) +
      absatz('danke für eure Anmeldung für unsere Freilandeier! Sie ist gut bei uns angekommen.') +
      kasten(`<strong>Ort:</strong> ${escapeHtml(d.ort)}<br><strong>Gewünscht:</strong> ${escapeHtml(mengeText(d))}`) +
      absatz('Im Frühjahr 2027 kommt ein Mobilstall mit 330 Hennen dazu. Bis dahin sammeln wir Anmeldungen auf einer ' +
        'Warteliste und melden uns persönlich bei euch, sobald wir euch beliefern können.') +
      absatz('Fragen? Antwortet einfach auf diese E-Mail oder ruft uns an: ' +
        '<a href="tel:+436642166181">+43 664 2166181</a> (auch WhatsApp).') +
      gruss +
      klein('Diese E-Mail wurde automatisch verschickt, weil auf kruckenhaus.at/freilandeier.html eine Anmeldung mit ' +
        'dieser Adresse abgeschickt wurde. War das nicht ihr? Dann antwortet kurz, wir löschen die Anmeldung.'),
  });
  return { betreff: `Eure Anmeldung beim ${BETRIEB}`, html };
}

/* ------------------------------------------------------------
   4. AKTUELLES VOM STALL
   ------------------------------------------------------------ */
const neuigkeitAusZeile = (z) => ({
  id: String(z.id), datum: z.datum, titel: z.titel, text: z.text, sichtbar: z.sichtbar === 1,
});

// Öffentlich: nur sichtbare Einträge, neueste zuerst. Fehlt die Tabelle
// (Schema noch nicht eingespielt), bleibt der Abschnitt einfach leer.
export async function neuigkeitenOeffentlich(db, anzahl = 6) {
  try {
    const { results } = await db.prepare(
      `SELECT id, datum, titel, text, sichtbar FROM stall_neuigkeiten
       WHERE sichtbar = 1 ORDER BY datum DESC, id DESC LIMIT ?`
    ).bind(anzahl).all();
    return results.map(({ datum, titel, text: t }) => ({ datum, titel, text: t }));
  } catch (fehler) {
    console.error('Neuigkeiten nicht lesbar:', String(fehler && fehler.message));
    return [];
  }
}

function neuigkeitPruefen(e) {
  const datum = String((e && e.datum) || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(`${datum}T12:00:00Z`))) {
    throw new EingabeFehler('Bitte ein gültiges Datum angeben.');
  }
  const titel = text(e.titel, 120);
  const inhalt = String(e.text ?? '').trim().slice(0, 1500);
  if (!titel) throw new EingabeFehler('Bitte eine Überschrift angeben.');
  if (!inhalt) throw new EingabeFehler('Bitte einen Text angeben.');
  return { datum, titel, text: inhalt, sichtbar: e.sichtbar === false ? 0 : 1 };
}

/* ------------------------------------------------------------
   5. CSV FÜR BERTHA
   Semikolon, BOM, Text in Anführungszeichen – öffnet sich im
   deutschsprachigen Excel direkt richtig. Text, der mit = + - @ beginnt,
   bekommt ein ' davor (sonst hält Excel ihn für eine Formel);
   Telefonnummern werden als 0043 … geschrieben (wie verwaltung.js).
   ------------------------------------------------------------ */
const CSV_SPALTEN = [
  ['Nr.', (a) => a.id],
  ['Angemeldet am', (a) => a.erstelltAm.slice(0, 10)],
  ['Status', (a) => STATUS[a.status]],
  ['Name', (a) => a.name],
  ['Straße', (a) => a.strasse],
  ['PLZ', (a) => a.plz],
  ['Ort', (a) => a.ort],
  ['Liefergebiet', (a) => GEBIET_TEXT[a.gebiet]],
  ['Telefon', (a) => a.telefon.replace(/^\+/, '00')],
  ['E-Mail', (a) => a.email],
  ['Schachteln pro Lieferung', (a) => a.schachteln],
  ['Rhythmus', (a) => RHYTHMUS[a.rhythmus]],
  ['Abstellort', (a) => ABSTELLORTE[a.abstellort] || a.abstellort],
  ['Hinweis Abstellort', (a) => a.abstellortHinweis || ''],
  ['Erfahren über', (a) => (a.herkunft ? HERKUNFT[a.herkunft] : '')],
  ['Empfohlen von', (a) => a.empfohlenVon || ''],
  ['Neuigkeiten vom Hof', (a) => (a.neuigkeiten ? 'ja' : 'nein')],
  ['Notiz', (a) => a.notiz || ''],
];

export function anmeldungenCsv(anmeldungen) {
  const zelle = (v) => {
    if (typeof v === 'number') return String(v);
    let t = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const zeilen = [CSV_SPALTEN.map(([k]) => k), ...anmeldungen.map((a) => CSV_SPALTEN.map(([, f]) => f(a)))];
  return '﻿' + zeilen.map((z) => z.map(zelle).join(';')).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------
   6. VERWALTUNG (/api/verwaltung/eier/…)
   Aufgerufen aus functions/api/verwaltung/[[pfad]].js – der Zugang ist
   dort schon geprüft (_middleware.js).
     GET  stand                         Anmeldungen + alle Einträge „Aktuelles"
     GET  export?status=neu,warteliste  CSV (ohne status: alle)
     POST anmeldung/<id>                { status?, notiz? }
     POST anmeldung/<id>/loeschen       endgültig löschen
     POST neuigkeit                     { datum, titel, text, sichtbar }
     POST neuigkeit/<id>                ändern (gleiche Felder)
     POST neuigkeit/<id>/loeschen
   ------------------------------------------------------------ */
const anmeldungAusZeile = (z) => ({
  id: String(z.id),
  erstelltAm: z.erstellt_am,
  geaendertAm: z.geaendert_am,
  status: z.status,
  name: z.name,
  strasse: z.strasse,
  plz: z.plz,
  ort: z.ort,
  gebiet: liefergebiet(z.plz),
  telefon: z.telefon,
  email: z.email,
  schachteln: z.schachteln,
  rhythmus: z.rhythmus,
  abstellort: z.abstellort,
  abstellortHinweis: z.abstellort_hinweis,
  herkunft: z.herkunft,
  empfohlenVon: z.empfohlen_von,
  neuigkeiten: z.neuigkeiten === 1,
  neuigkeitenSeit: z.neuigkeiten_seit,
  notiz: z.notiz,
});

async function anmeldungenLaden(db, status = null) {
  const filter = status && status.length ? `WHERE status IN (${status.map(() => '?').join(', ')})` : '';
  const { results } = await db.prepare(
    `SELECT * FROM eier_anmeldungen ${filter} ORDER BY erstellt_am DESC, id DESC`
  ).bind(...(status || [])).all();
  return results.map(anmeldungAusZeile);
}

function nummer(wert, name) {
  const n = Number(wert);
  if (!Number.isInteger(n) || n <= 0) throw new EingabeFehler(`Ungültige ${name}.`);
  return n;
}

export async function eierVerwaltung(db, request, pfad) {
  const [bereich, teilId, unteraktion] = pfad;

  if (request.method === 'GET' && bereich === 'stand' && pfad.length === 1) {
    const { results } = await db.prepare(
      'SELECT id, datum, titel, text, sichtbar FROM stall_neuigkeiten ORDER BY datum DESC, id DESC'
    ).all();
    return json({ ok: true, anmeldungen: await anmeldungenLaden(db), neuigkeiten: results.map(neuigkeitAusZeile) });
  }
  if (request.method === 'GET' && bereich === 'export' && pfad.length === 1) {
    const roh = new URL(request.url).searchParams.get('status');
    const status = roh ? roh.split(',').filter((s) => STATUS[s]) : null;
    if (roh && !status.length) throw new EingabeFehler('Ungültiger Status.');
    const datum = new Date().toISOString().slice(0, 10);
    return new Response(anmeldungenCsv(await anmeldungenLaden(db, status)), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="eierkunden-${datum}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'Nicht gefunden.' }, 404);
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return json({ ok: false, error: 'Nur JSON-Anfragen.' }, 415);
  }
  const eingabe = await request.json().catch(() => {
    throw new EingabeFehler('Ungültige Anfrage.');
  });

  if (bereich === 'anmeldung' && pfad.length === 2) {
    const aid = nummer(teilId, 'Anmeldung');
    const felder = [];
    const werte = [];
    if (eingabe.status !== undefined) {
      if (!STATUS[eingabe.status]) throw new EingabeFehler('Ungültiger Status.');
      felder.push('status = ?');
      werte.push(eingabe.status);
    }
    if (eingabe.notiz !== undefined) {
      felder.push('notiz = ?');
      werte.push(String(eingabe.notiz ?? '').trim().slice(0, 1000) || null);
    }
    if (!felder.length) throw new EingabeFehler('Nichts zu ändern.');
    const r = await db.prepare(
      `UPDATE eier_anmeldungen SET ${felder.join(', ')}, geaendert_am = datetime('now') WHERE id = ?`
    ).bind(...werte, aid).run();
    if (!r.meta.changes) throw new EingabeFehler('Anmeldung nicht gefunden.');
    return json({ ok: true });
  }
  if (bereich === 'anmeldung' && unteraktion === 'loeschen' && pfad.length === 3) {
    const r = await db.prepare('DELETE FROM eier_anmeldungen WHERE id = ?').bind(nummer(teilId, 'Anmeldung')).run();
    if (!r.meta.changes) throw new EingabeFehler('Anmeldung nicht gefunden.');
    return json({ ok: true });
  }
  if (bereich === 'neuigkeit' && pfad.length === 1) {
    const n = neuigkeitPruefen(eingabe);
    const r = await db.prepare(
      'INSERT INTO stall_neuigkeiten (datum, titel, text, sichtbar) VALUES (?, ?, ?, ?) RETURNING id'
    ).bind(n.datum, n.titel, n.text, n.sichtbar).first();
    return json({ ok: true, id: String(r.id) });
  }
  if (bereich === 'neuigkeit' && pfad.length === 2) {
    const n = neuigkeitPruefen(eingabe);
    const r = await db.prepare(
      `UPDATE stall_neuigkeiten SET datum = ?, titel = ?, text = ?, sichtbar = ?, geaendert_am = datetime('now') WHERE id = ?`
    ).bind(n.datum, n.titel, n.text, n.sichtbar, nummer(teilId, 'Eintrag')).run();
    if (!r.meta.changes) throw new EingabeFehler('Eintrag nicht gefunden.');
    return json({ ok: true });
  }
  if (bereich === 'neuigkeit' && unteraktion === 'loeschen' && pfad.length === 3) {
    const r = await db.prepare('DELETE FROM stall_neuigkeiten WHERE id = ?').bind(nummer(teilId, 'Eintrag')).run();
    if (!r.meta.changes) throw new EingabeFehler('Eintrag nicht gefunden.');
    return json({ ok: true });
  }
  return json({ ok: false, error: 'Nicht gefunden.' }, 404);
}

