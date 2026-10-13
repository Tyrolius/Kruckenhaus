/* ============================================================
 * GEMEINSAME HELFER – Bestellungen von außen (Website und Bertha)
 * ============================================================
 * Wird von functions/api/hofladen/ (Bestellseite hofladen.html) und
 * functions/api/extern/v1/ (Bertha-Kundenportal) importiert – damit beide
 * Wege dieselbe Prüfung, dieselbe Kundenzuordnung und dieselben Mails
 * nutzen (Plan: docs/SCHNITTSTELLE-BERTHA.md, Abschnitt 4.3).
 * Keine Route (exportiert keinen onRequest-Handler).
 *
 * Inhalt:
 *   1. Eingaben (Zahlarten, Größenlimit, Kontakt, Zustimmung)
 *   2. Kunde (wiederfinden oder neu anlegen)
 *   3. Bestätigungsmails (an Kunden und Hof)
 * ============================================================ */

import { escapeHtml, istGueltigeEmail, EingabeFehler, mailSenden } from './hofladen.js';
import { BETRIEB, mailHtml, absatz, klein, knopf, kasten, gruss, positionenHtml } from './mail.js';

/* ------------------------------------------------------------
   1. EINGABEN
   ------------------------------------------------------------ */
export const ZAHLARTEN = { bar: 'bar bei Übergabe', ueberweisung: 'Überweisung' };
export const MAX_ANFRAGE_BYTES = 20000;

export const text = (wert, max = 200) => String(wert ?? '').trim().slice(0, max);

// Heutiges Datum in Tirol (für den Bestellschluss, inklusive des Tages)
export function heuteInTirol() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
}

export async function eingabeLesen(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    throw new EingabeFehler('Ungültige Anfrage.');
  }
  const rohtext = await request.text();
  if (rohtext.length > MAX_ANFRAGE_BYTES) throw new EingabeFehler('Anfrage zu groß.');
  try {
    return JSON.parse(rohtext);
  } catch {
    throw new EingabeFehler('Ungültige Anfrage.');
  }
}

// Kontaktdaten wie im Bestellformular prüfen (Name, E-Mail, Telefon, Adresse)
export function kontaktPruefen(e) {
  const kontakt = {
    name: text(e.name, 120),
    email: text(e.email, 160).toLowerCase(),
    telefon: text(e.telefon, 40),
    strasse: text(e.strasse, 120),
    plz: text(e.plz, 10),
    ort: text(e.ort, 80),
  };
  if (kontakt.name.length < 2) throw new EingabeFehler('Bitte euren Namen eintragen.');
  if (!istGueltigeEmail(kontakt.email)) throw new EingabeFehler('Bitte eine gültige E-Mail-Adresse eintragen.');
  if (kontakt.telefon.replace(/\D/g, '').length < 6) throw new EingabeFehler('Bitte eine Telefonnummer eintragen.');
  return kontakt;
}

// Website: Häkchen „Bestellbedingungen und Datenschutzerklärung"
export function zustimmungPruefen(e) {
  if (e.zustimmung !== true) {
    throw new EingabeFehler('Bitte bestätigt die Bestellbedingungen und die Datenschutzerklärung.');
  }
}

/* ------------------------------------------------------------
   2. KUNDE
   Über die E-Mail-Adresse wiederfinden; vorhandene Angaben bleiben,
   nur leere Felder werden ergänzt. Sonst neu anlegen.
   ------------------------------------------------------------ */
export async function kundeFinden(db, k) {
  const vorhanden = await db.prepare('SELECT id FROM kunden WHERE lower(email) = ? ORDER BY id LIMIT 1')
    .bind(k.email).first();
  if (vorhanden) {
    await db.prepare(
      `UPDATE kunden SET telefon = COALESCE(telefon, ?), strasse = COALESCE(strasse, ?),
              plz = COALESCE(plz, ?), ort = COALESCE(ort, ?)
       WHERE id = ?`
    ).bind(k.telefon || null, k.strasse || null, k.plz || null, k.ort || null, vorhanden.id).run();
    return vorhanden.id;
  }
  const neu = await db.prepare(
    'INSERT INTO kunden (name, email, telefon, strasse, plz, ort) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
  ).bind(k.name, k.email, k.telefon || null, k.strasse || null, k.plz || null, k.ort || null).first();
  return neu.id;
}

export const linkAdresse = (request, schluessel) => `${new URL(request.url).origin}/meine-bestellungen.html#${schluessel}`;

/* ------------------------------------------------------------
   3. BESTÄTIGUNGSMAILS (an Kunden und Hof)
   ------------------------------------------------------------ */
export const linkHinweis = klein('Euer persönlicher Link – bitte nicht weitergeben.');

// Übergabe beim Dauersortiment (offene Frage 1 im Plan: nach Absprache)
export const DAUER_UEBERGABE = 'Abholung am Hof nach Absprache – wir melden uns, sobald alles bereitliegt';

/**
 * Bestätigung an den Kunden und Benachrichtigung an den Hof.
 * d: kontakt, charge, zahlart, bestellung, zeilen, link, anmerkung, terminText,
 *    ueber (optional, z. B. 'Bertha-Portal' – erscheint nur in der Mail an den Hof)
 */
export async function bestellMailsSenden(env, d) {
  const aufWarteliste = d.bestellung.status === 'warteliste';
  const kundenHtml = mailHtml({
    titel: aufWarteliste ? 'Ihr steht auf der Warteliste' : 'Eure Vorbestellung ist fix',
    vorschau: `Bestellung ${d.bestellung.nummer} – ${d.terminText}`,
    inhalt: [
      absatz(`Hallo ${escapeHtml(d.kontakt.name)},`),
      absatz(aufWarteliste
        ? 'danke für eure Vorbestellung! Leider ist die gewünschte Menge gerade nicht mehr frei – ihr steht auf der <strong>Warteliste</strong>. Sobald etwas frei wird, melden wir uns.'
        : 'danke für eure Vorbestellung – sie ist bei uns <strong>fix vorgemerkt</strong>.'),
      kasten(`<strong>Bestellnummer ${escapeHtml(d.bestellung.nummer)}</strong><br>
        ${escapeHtml(d.charge.titel)}<br>
        ${escapeHtml(d.terminText)}<br>
        Zahlung: ${escapeHtml(ZAHLARTEN[d.zahlart])}`),
      positionenHtml(d.zeilen),
      knopf(d.link, 'Meine Bestellungen ansehen'),
      linkHinweis,
      absatz(`Etwas ändern oder stornieren? Einfach anrufen oder per WhatsApp melden:
        <a href="tel:+436642166181">+43 664 2166181</a>.`),
      klein('Für Nudeln, Honig und Seife habt ihr ein 14-tägiges Rücktrittsrecht – widerrufen könnt ihr direkt unter „Meine Bestellungen".'),
      gruss,
    ].join(''),
  });

  const hofHtml = mailHtml({
    art: 'hof',
    titel: `Neue Vorbestellung ${d.bestellung.nummer}${d.ueber ? ` über ${d.ueber}` : ''}${aufWarteliste ? ' (Warteliste)' : ''}`,
    inhalt: [
      kasten(`<strong>${escapeHtml(d.kontakt.name)}</strong><br>${escapeHtml(d.kontakt.telefon)} · ${escapeHtml(d.kontakt.email)}`),
      absatz(`${escapeHtml(d.charge.titel)} – ${escapeHtml(d.terminText)}<br>Zahlung: ${escapeHtml(ZAHLARTEN[d.zahlart])}`),
      positionenHtml(d.zeilen),
      d.anmerkung ? absatz(`<strong>Anmerkung:</strong> ${escapeHtml(d.anmerkung)}`) : '',
    ].join(''),
  });

  await Promise.all([
    mailSenden(env, {
      an: d.kontakt.email,
      betreff: `Eure Vorbestellung ${d.bestellung.nummer} – ${BETRIEB}`,
      html: kundenHtml,
      antwortAn: env.CONTACT_TO || 'info@kruckenhaus.at',
    }),
    mailSenden(env, {
      an: env.CONTACT_TO || 'info@kruckenhaus.at',
      betreff: `Neue Vorbestellung ${d.bestellung.nummer} von ${d.kontakt.name}${d.ueber ? ` (über ${d.ueber})` : ''}`,
      html: hofHtml,
      antwortAn: d.kontakt.email,
    }),
  ]);
}
