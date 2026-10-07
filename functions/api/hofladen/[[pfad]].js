/* ============================================================
 * CLOUDFLARE PAGES FUNCTION – Hofladen für Kundinnen und Kunden
 * ============================================================
 * Öffentliche Schnittstelle der Bestellseite hofladen.html und der Seite
 * meine-bestellungen.html (Plan: docs/HOFLADEN-VORBESTELLUNG.md, Phase 4).
 *
 *   GET  /api/hofladen/angebot       offene Bestellrunden mit freier Menge, Termine,
 *                                    Liefergebiet, Sortiment (alle eingeblendeten
 *                                    Produkte, auch für Voranmeldungen)
 *   POST /api/hofladen/bestellung    verbindliche Vorbestellung
 *   POST /api/hofladen/voranmeldung  unverbindliche Voranmeldung
 *   GET  /api/hofladen/meine         Bestellungen zum persönlichen Link
 *                                    (Schlüssel im Header X-Link-Schluessel),
 *                                    bei offener Überweisung mit Bankverbindung
 *   POST /api/hofladen/widerruf      „Vertrag widerrufen" (§ 13a FAGG): mit
 *                                    persönlichem Link (Header wie oben) oder
 *                                    über das Formular (Name, E-Mail, Bestellnummer).
 *                                    Wird gespeichert und per E-Mail mit
 *                                    Zeitpunkt bestätigt; storniert nicht selbst.
 *
 * Ablauf einer Bestellung:
 *   1. Spam-Falle (Feld „bot-field"), Pflichtfelder, Zustimmung prüfen
 *   2. Bestellrunde offen und Bestellschluss nicht vorbei, Termin und
 *      Liefergebiet passen, Höchstmengen eingehalten
 *   3. Kunde über die E-Mail-Adresse wiederfinden oder neu anlegen
 *      (bestehende Daten werden nie überschrieben, nur Lücken gefüllt)
 *   4. Bestellung anlegen – überbuchungssicher, sonst Warteliste
 *   5. Persönlichen Link erzeugen, Bestätigung an den Kunden und
 *      Benachrichtigung an den Hof per E-Mail (Resend)
 *
 * Keine IP-Adresse, keine Browserkennung, keine Cookies.
 * Fehlt RESEND_API_KEY, wird trotzdem gespeichert (nur keine Mail).
 *
 * Bindings / Variablen: DB (D1), RESEND_API_KEY (Secret, optional),
 *   CONTACT_TO (Empfänger Hof), CONTACT_FROM (Absender),
 *   BANK_INHABER, BANK_IBAN, BANK_BIC, BANK_NAME (Secrets, optional)
 * ============================================================ */

import {
  json, escapeHtml, istGueltigeEmail, EingabeFehler, euro, positionBetrag, zeitraumText, ZEITRAEUME,
  bestellungAnlegen, voranmeldungAnlegen, kundenLinkErstellen, kundeAusLink, mailSenden, bankAusEnv,
} from '../../_lib/hofladen.js';
import {
  BETRIEB, mailHtml, absatz, klein, knopf, kasten, gruss, positionenHtml, terminText,
} from '../../_lib/mail.js';

const ZAHLARTEN = { bar: 'bar bei Übergabe', ueberweisung: 'Überweisung' };
const MAX_ANFRAGE_BYTES = 20000;

/* ------------------------------------------------------------
   1. HELFER
   ------------------------------------------------------------ */
const text = (wert, max = 200) => String(wert ?? '').trim().slice(0, max);

// Heutiges Datum in Tirol (für den Bestellschluss, inklusive des Tages)
function heuteInTirol() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
}

async function eingabeLesen(request) {
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

function kontaktPruefen(e) {
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
  if (e.zustimmung !== true) {
    throw new EingabeFehler('Bitte bestätigt die Bestellbedingungen und die Datenschutzerklärung.');
  }
  return kontakt;
}

// Kunde über die E-Mail-Adresse wiederfinden; vorhandene Angaben bleiben,
// nur leere Felder werden ergänzt. Sonst neu anlegen.
async function kundeFinden(db, k) {
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

const linkAdresse = (request, schluessel) => `${new URL(request.url).origin}/meine-bestellungen.html#${schluessel}`;

/* ------------------------------------------------------------
   2. ANGEBOT
   ------------------------------------------------------------ */
async function angebotLaden(db) {
  const heute = heuteInTirol();
  const offen = `SELECT id FROM chargen WHERE status = 'offen' AND bestellschluss >= ?`;
  const [chargen, artikel, termine, liefergebiet, produkte] = (await db.batch([
    db.prepare(`SELECT id, titel, beschreibung, bestellschluss FROM chargen
                WHERE status = 'offen' AND bestellschluss >= ? ORDER BY bestellschluss, id`).bind(heute),
    db.prepare(`SELECT ca.id, ca.charge_id, ca.produkt_id, ca.preis_cent, ca.max_pro_bestellung, v.frei,
                       p.name, p.art, p.kategorie, p.beschreibung, p.pflichtangaben, p.allergene,
                       p.richtgewicht_von_g, p.richtgewicht_bis_g
                FROM charge_artikel ca
                JOIN produkte p ON p.id = ca.produkt_id
                JOIN v_bestand v ON v.charge_artikel_id = ca.id
                WHERE ca.charge_id IN (${offen})
                ORDER BY p.kategorie, ca.reihenfolge, p.reihenfolge, p.name`).bind(heute),
    db.prepare(`SELECT id, charge_id, art, datum, von, bis, hinweis FROM termine
                WHERE charge_id IN (${offen}) ORDER BY datum, von`).bind(heute),
    db.prepare('SELECT plz, ort FROM liefergebiet ORDER BY tour_reihenfolge, ort'),
    db.prepare(`SELECT id, name, art, kategorie, beschreibung, pflichtangaben, allergene,
                       richtgewicht_von_g, richtgewicht_bis_g, bild
                FROM produkte WHERE aktiv = 1 ORDER BY kategorie, reihenfolge, name`),
  ])).map((r) => r.results);

  return {
    chargen: chargen.map((c) => ({
      id: c.id,
      titel: c.titel,
      beschreibung: c.beschreibung || '',
      bestellschluss: c.bestellschluss,
      termine: termine.filter((t) => t.charge_id === c.id).map((t) => ({
        id: t.id, art: t.art, datum: t.datum, von: t.von || '', bis: t.bis || '', hinweis: t.hinweis || '',
      })),
      artikel: artikel.filter((a) => a.charge_id === c.id).map((a) => ({
        id: a.id,
        produktId: a.produkt_id,
        name: a.name,
        art: a.art,
        kategorie: a.kategorie,
        preisCent: a.preis_cent,
        frei: Math.max(0, a.frei),
        maxProBestellung: a.max_pro_bestellung,
        richtVonG: a.richtgewicht_von_g,
        richtBisG: a.richtgewicht_bis_g,
        beschreibung: a.beschreibung || '',
        pflichtangaben: a.pflichtangaben || '',
        allergene: a.allergene || '',
      })),
    })),
    liefergebiet,
    produkte: produkte.map((p) => ({
      id: p.id,
      name: p.name,
      art: p.art,
      kategorie: p.kategorie,
      beschreibung: p.beschreibung || '',
      pflichtangaben: p.pflichtangaben || '',
      allergene: p.allergene || '',
      richtVonG: p.richtgewicht_von_g,
      richtBisG: p.richtgewicht_bis_g,
      bild: p.bild || '',
    })),
    zeitraeume: ZEITRAEUME,
  };
}

/* ------------------------------------------------------------
   3. BESTELLUNG
   ------------------------------------------------------------ */
async function bestellungAufnehmen(db, env, request, e) {
  const kontakt = kontaktPruefen(e);
  const chargeId = Number(e.chargeId);
  const charge = await db.prepare(
    `SELECT id, titel FROM chargen WHERE id = ? AND status = 'offen' AND bestellschluss >= ?`
  ).bind(Number.isInteger(chargeId) ? chargeId : -1, heuteInTirol()).first();
  if (!charge) throw new EingabeFehler('Für diese Bestellrunde kann nicht mehr bestellt werden (Bestellschluss vorbei).');

  const termin = await db.prepare('SELECT id, art, datum, von, bis FROM termine WHERE id = ? AND charge_id = ?')
    .bind(Number(e.terminId) || -1, charge.id).first();
  if (!termin) throw new EingabeFehler('Bitte einen Abhol- oder Liefertermin wählen.');

  let lieferadresse = null;
  if (termin.art === 'lieferung') {
    const gebiet = await db.prepare('SELECT ort FROM liefergebiet WHERE plz = ?').bind(kontakt.plz).first();
    if (!gebiet) throw new EingabeFehler('Diese Postleitzahl liegt leider außerhalb unseres Liefergebiets – bitte Abholung wählen.');
    if (!kontakt.strasse || !kontakt.ort) throw new EingabeFehler('Bitte die Lieferadresse vollständig eintragen.');
    lieferadresse = `${kontakt.strasse}, ${kontakt.plz} ${kontakt.ort}`;
  }

  const positionen = (Array.isArray(e.positionen) ? e.positionen : [])
    .map((p) => ({ chargeArtikelId: Number(p.artikelId), menge: Number(p.menge) }))
    .filter((p) => p.menge > 0);
  if (!positionen.length) throw new EingabeFehler('Bitte mindestens ein Produkt auswählen.');
  if (positionen.length > 30 || positionen.some((p) => !Number.isInteger(p.menge) || p.menge > 99)) {
    throw new EingabeFehler('Ungültige Menge.');
  }

  const zahlart = ZAHLARTEN[e.zahlart] ? e.zahlart : 'bar';
  const kundeId = await kundeFinden(db, kontakt);
  const bestellung = await bestellungAnlegen(db, {
    chargeId: charge.id,
    kundeId,
    terminId: termin.id,
    quelle: 'web',
    zahlart,
    lieferadresse,
    anmerkung: text(e.anmerkung, 1000) || null,
    positionen,
  });
  const schluessel = await kundenLinkErstellen(db, kundeId);
  const link = linkAdresse(request, schluessel);

  // Positionen für die Mails (Preis zum Bestellzeitpunkt)
  const { results: zeilen } = await db.prepare(
    `SELECT produkt_name, art, menge, einzelpreis_cent, betrag_cent, geschaetzt
     FROM v_positionen WHERE bestellung_id = ? ORDER BY id`
  ).bind(bestellung.id).all();
  await bestellMailsSenden(env, { kontakt, charge, termin, zahlart, bestellung, zeilen, link, anmerkung: text(e.anmerkung, 1000) });

  return { nummer: bestellung.nummer, status: bestellung.status, link };
}

const linkHinweis = klein('Euer persönlicher Link – bitte nicht weitergeben.');

async function bestellMailsSenden(env, d) {
  const aufWarteliste = d.bestellung.status === 'warteliste';
  const kundenHtml = mailHtml({
    titel: aufWarteliste ? 'Ihr steht auf der Warteliste' : 'Eure Vorbestellung ist fix',
    vorschau: `Bestellung ${d.bestellung.nummer} – ${terminText(d.termin)}`,
    inhalt: [
      absatz(`Hallo ${escapeHtml(d.kontakt.name)},`),
      absatz(aufWarteliste
        ? 'danke für eure Vorbestellung! Leider ist die gewünschte Menge gerade nicht mehr frei – ihr steht auf der <strong>Warteliste</strong>. Sobald etwas frei wird, melden wir uns.'
        : 'danke für eure Vorbestellung – sie ist bei uns <strong>fix vorgemerkt</strong>.'),
      kasten(`<strong>Bestellnummer ${escapeHtml(d.bestellung.nummer)}</strong><br>
        ${escapeHtml(d.charge.titel)}<br>
        ${escapeHtml(terminText(d.termin))}<br>
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
    titel: `Neue Vorbestellung ${d.bestellung.nummer}${aufWarteliste ? ' (Warteliste)' : ''}`,
    inhalt: [
      kasten(`<strong>${escapeHtml(d.kontakt.name)}</strong><br>${escapeHtml(d.kontakt.telefon)} · ${escapeHtml(d.kontakt.email)}`),
      absatz(`${escapeHtml(d.charge.titel)} – ${escapeHtml(terminText(d.termin))}<br>Zahlung: ${escapeHtml(ZAHLARTEN[d.zahlart])}`),
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
      betreff: `Neue Vorbestellung ${d.bestellung.nummer} von ${d.kontakt.name}`,
      html: hofHtml,
      antwortAn: d.kontakt.email,
    }),
  ]);
}

/* ------------------------------------------------------------
   4. VORANMELDUNG
   ------------------------------------------------------------ */
async function voranmeldungAufnehmen(db, env, request, e) {
  const kontakt = kontaktPruefen(e);
  const produkt = await db.prepare('SELECT id, name FROM produkte WHERE id = ? AND aktiv = 1')
    .bind(Number(e.produktId) || -1).first();
  if (!produkt) throw new EingabeFehler('Bitte ein Produkt auswählen.');
  const kundeId = await kundeFinden(db, kontakt);
  await voranmeldungAnlegen(db, {
    kundeId,
    produktId: produkt.id,
    menge: e.menge,
    zeitraum: e.zeitraum,
    jahr: e.jahr,
    quelle: 'web',
    notiz: text(e.notiz, 500) || null,
  });
  const schluessel = await kundenLinkErstellen(db, kundeId);
  const link = linkAdresse(request, schluessel);
  const wann = zeitraumText(e.zeitraum, e.jahr);
  const was = `${Number(e.menge)}× ${produkt.name} (${wann})`;

  await Promise.all([
    mailSenden(env, {
      an: kontakt.email,
      betreff: `Eure Voranmeldung – ${BETRIEB}`,
      antwortAn: env.CONTACT_TO || 'info@kruckenhaus.at',
      html: mailHtml({
        titel: 'Ihr seid vorgemerkt',
        vorschau: was,
        inhalt: [
          absatz(`Hallo ${escapeHtml(kontakt.name)},`),
          absatz('danke – wir haben euch vorgemerkt:'),
          kasten(`<strong>${escapeHtml(was)}</strong>`),
          absatz(`Die Voranmeldung ist <strong>unverbindlich</strong> und noch ohne Preis. Sobald die passende
            Bestellrunde feststeht, melden wir uns mit Preis und Termin.`),
          knopf(link, 'Meine Bestellungen ansehen'),
          linkHinweis,
          gruss,
        ].join(''),
      }),
    }),
    mailSenden(env, {
      an: env.CONTACT_TO || 'info@kruckenhaus.at',
      betreff: `Neue Voranmeldung von ${kontakt.name}`,
      antwortAn: kontakt.email,
      html: mailHtml({
        art: 'hof',
        titel: 'Neue Voranmeldung',
        inhalt: [
          kasten(`<strong>${escapeHtml(kontakt.name)}</strong><br>${escapeHtml(kontakt.telefon)} · ${escapeHtml(kontakt.email)}`),
          absatz(escapeHtml(was)),
          e.notiz ? absatz(`Notiz: ${escapeHtml(text(e.notiz, 500))}`) : '',
        ].join(''),
      }),
    }),
  ]);
  return { link };
}

/* ------------------------------------------------------------
   5. MEINE BESTELLUNGEN
   ------------------------------------------------------------ */
async function meineLaden(db, schluessel) {
  const kundeId = await kundeAusLink(db, schluessel);
  if (!kundeId) return null;
  const [kunden, bestellungen, positionen, voranmeldungen, widerrufe] = (await db.batch([
    db.prepare('SELECT name FROM kunden WHERE id = ?').bind(kundeId),
    db.prepare(`SELECT b.id, b.nummer, b.status, b.zahlart, b.bezahlt_art, b.uebergeben_am, b.lieferadresse,
                       b.erstellt_am, c.titel, t.art, t.datum, t.von, t.bis, s.gesamt_cent, s.geschaetzt
                FROM bestellungen b
                JOIN chargen c ON c.id = b.charge_id
                LEFT JOIN termine t ON t.id = b.termin_id
                JOIN v_bestellsummen s ON s.bestellung_id = b.id
                WHERE b.kunde_id = ? AND b.erstellt_am >= datetime('now', '-400 days')
                ORDER BY b.erstellt_am DESC, b.id DESC`).bind(kundeId),
    db.prepare(`SELECT v.bestellung_id, v.produkt_name, v.art, v.menge, v.einzelpreis_cent, v.gewicht_g,
                       v.betrag_cent, v.geschaetzt
                FROM v_positionen v JOIN bestellungen b ON b.id = v.bestellung_id
                WHERE b.kunde_id = ? ORDER BY v.id`).bind(kundeId),
    db.prepare(`SELECT v.menge, v.zeitraum, v.jahr, v.status, v.erstellt_am, p.name
                FROM voranmeldungen v JOIN produkte p ON p.id = v.produkt_id
                WHERE v.kunde_id = ? AND v.status = 'offen'
                ORDER BY v.erstellt_am DESC`).bind(kundeId),
    db.prepare(`SELECT w.bestellung_id, w.umfang, w.eingegangen_am FROM widerrufe w
                JOIN bestellungen b ON b.id = w.bestellung_id
                WHERE b.kunde_id = ? ORDER BY w.id`).bind(kundeId),
  ])).map((r) => r.results);

  return {
    name: kunden[0] ? kunden[0].name : '',
    bestellungen: bestellungen.map((b) => ({
      nummer: b.nummer,
      status: b.status,
      charge: b.titel,
      termin: b.datum ? { art: b.art, datum: b.datum, von: b.von || '', bis: b.bis || '' } : null,
      lieferadresse: b.lieferadresse || '',
      zahlart: b.zahlart,
      bezahlt: b.bezahlt_art || null,
      uebergeben: Boolean(b.uebergeben_am),
      summeCent: b.gesamt_cent,
      geschaetzt: Boolean(b.geschaetzt),
      widerrufe: widerrufe.filter((w) => w.bestellung_id === b.id)
        .map((w) => ({ umfang: w.umfang, eingegangen: zeitpunktText(w.eingegangen_am) })),
      positionen: positionen.filter((p) => p.bestellung_id === b.id).map((p) => ({
        name: p.produkt_name,
        art: p.art,
        menge: p.menge,
        preisCent: p.einzelpreis_cent,
        gewichtG: p.gewicht_g,
        betragCent: p.betrag_cent,
        geschaetzt: Boolean(p.geschaetzt),
      })),
    })),
    voranmeldungen: voranmeldungen.map((v) => ({
      produkt: v.name, menge: v.menge, zeitraum: v.zeitraum, jahr: v.jahr, zeitraumText: zeitraumText(v.zeitraum, v.jahr),
    })),
  };
}

// Genauer Betrag steht fest (alles gewogen), Zahlung per Überweisung offen
function istUeberweisungFaellig(b) {
  return b.status === 'vorgemerkt' && b.zahlart === 'ueberweisung' && !b.bezahlt && !b.geschaetzt && b.summeCent > 0;
}

/* ------------------------------------------------------------
   5a. WIDERRUF („Vertrag widerrufen", § 13a FAGG)
   Zwei Wege: aus „Meine Bestellungen" (Kunde über den Link bekannt) oder
   über das Formular auf hofladen.html. Jeder Eingang wird gespeichert –
   auch wenn Bestellnummer und E-Mail nicht zusammenpassen, dann klärt der
   Hof das. Der Kunde bekommt sofort eine Eingangsbestätigung mit Inhalt,
   Datum und Uhrzeit per E-Mail und auf der Seite.
   ------------------------------------------------------------ */
function zeitpunktText(sqlZeit) {
  return new Date(`${sqlZeit.replace(' ', 'T')}Z`).toLocaleString('de-AT', {
    timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

async function widerrufAufnehmen(db, env, schluessel, e) {
  const umfang = e.umfang === 'teil' ? text(e.produkte, 500) : 'Ganze Bestellung';
  if (!umfang) throw new EingabeFehler('Bitte angeben, welche Produkte ihr widerrufen wollt.');
  const nummer = text(e.bestellnummer, 20);

  let name;
  let email;
  let bestellung;
  let quelle;
  if (schluessel) {
    const kundeId = await kundeAusLink(db, schluessel);
    if (!kundeId) throw new EingabeFehler('Dieser Link ist ungültig – bitte das Formular auf der Hofladen-Seite verwenden.');
    bestellung = await db.prepare(
      `SELECT b.id, b.nummer, k.name, k.email FROM bestellungen b JOIN kunden k ON k.id = b.kunde_id
       WHERE b.nummer = ? AND b.kunde_id = ?`
    ).bind(nummer, kundeId).first();
    if (!bestellung) throw new EingabeFehler('Bestellung nicht gefunden.');
    ({ name, email } = bestellung);
    quelle = 'link';
  } else {
    name = text(e.name, 120);
    email = text(e.email, 160).toLowerCase();
    if (name.length < 2) throw new EingabeFehler('Bitte euren Namen eintragen.');
    if (!istGueltigeEmail(email)) throw new EingabeFehler('Bitte die E-Mail-Adresse eintragen, mit der ihr bestellt habt.');
    if (!nummer) throw new EingabeFehler('Bitte die Bestellnummer eintragen (steht in der Bestätigungsmail, z. B. 2026-014).');
    bestellung = await db.prepare(
      `SELECT b.id, b.nummer FROM bestellungen b JOIN kunden k ON k.id = b.kunde_id
       WHERE b.nummer = ? AND lower(k.email) = ?`
    ).bind(nummer, email).first();
    quelle = 'formular';
  }

  const zeile = await db.prepare(
    `INSERT INTO widerrufe (bestellung_id, bestellnummer, name, email, umfang, quelle)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING eingegangen_am`
  ).bind(bestellung ? bestellung.id : null, nummer, name, email || '', umfang, quelle).first();
  const zeitpunkt = zeitpunktText(zeile.eingegangen_am);

  const inhalt = kasten(`<strong>Bestellnummer:</strong> ${escapeHtml(nummer)}<br>
      <strong>Widerrufen:</strong> ${escapeHtml(umfang)}<br>
      <strong>Name:</strong> ${escapeHtml(name)}<br>
      <strong>Eingegangen am:</strong> ${escapeHtml(zeitpunkt)} Uhr`);
  await Promise.all([
    email && mailSenden(env, {
      an: email,
      betreff: `Eingangsbestätigung eures Widerrufs ${nummer} – ${BETRIEB}`,
      antwortAn: env.CONTACT_TO || 'info@kruckenhaus.at',
      html: mailHtml({
        titel: 'Euer Widerruf ist eingegangen',
        vorschau: `Bestellung ${nummer} – eingegangen am ${zeitpunkt} Uhr`,
        inhalt: [
          absatz(`Hallo ${escapeHtml(name)},`),
          absatz('wir bestätigen den Eingang eures Widerrufs:'),
          inhalt,
          absatz(`Wir melden uns in den nächsten Tagen zur Abwicklung. Bereits bezahlte Beträge erstatten wir
            innerhalb von 14 Tagen.`),
          klein('Für frisches Fleisch besteht kein Rücktrittsrecht (§ 18 Abs. 1 Z 4 FAGG).'),
          gruss,
        ].join(''),
      }),
    }),
    mailSenden(env, {
      an: env.CONTACT_TO || 'info@kruckenhaus.at',
      betreff: `Widerruf zur Bestellung ${nummer} von ${name}`,
      antwortAn: email || undefined,
      html: mailHtml({
        art: 'hof',
        titel: 'Widerruf eingegangen',
        inhalt: [
          inhalt,
          absatz(bestellung ? 'Die Bestellung ist zugeordnet.' : '<strong>Achtung:</strong> Bestellnummer und E-Mail passen zu keiner Bestellung – bitte klären.'),
          absatz('In der Verwaltung unter „Übersicht" erledigen und als erledigt markieren.'),
        ].join(''),
      }),
    }),
  ]);
  return { nummer, umfang, eingegangen: zeitpunkt };
}

/* ------------------------------------------------------------
   6. VERTEILER
   ------------------------------------------------------------ */
export async function onRequest({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: 'Der Hofladen ist gerade nicht erreichbar.' }, 503);
  const db = env.DB;
  const pfad = [].concat(params.pfad || []).join('/');

  try {
    if (request.method === 'GET' && pfad === 'angebot') {
      return json({ ok: true, ...(await angebotLaden(db)) });
    }
    if (request.method === 'GET' && pfad === 'meine') {
      const daten = await meineLaden(db, request.headers.get('X-Link-Schluessel'));
      if (!daten) return json({ ok: false, error: 'Dieser Link ist ungültig oder wurde gesperrt.' }, 404);
      // Bankverbindung nur mitschicken, wenn gerade eine Überweisung ansteht
      const bank = daten.bestellungen.some(istUeberweisungFaellig) ? bankAusEnv(env) : null;
      return json({ ok: true, ...daten, bank });
    }
    if (request.method === 'POST' && (pfad === 'bestellung' || pfad === 'voranmeldung')) {
      const eingabe = await eingabeLesen(request);
      // Spam-Falle: Bots füllen dieses versteckte Feld aus – still ins Leere laufen lassen
      if (eingabe['bot-field']) return json({ ok: true });
      const ergebnis = pfad === 'bestellung'
        ? await bestellungAufnehmen(db, env, request, eingabe)
        : await voranmeldungAufnehmen(db, env, request, eingabe);
      return json({ ok: true, ...ergebnis });
    }
    if (request.method === 'POST' && pfad === 'widerruf') {
      const eingabe = await eingabeLesen(request);
      if (eingabe['bot-field']) return json({ ok: true });
      return json({ ok: true, ...(await widerrufAufnehmen(db, env, request.headers.get('X-Link-Schluessel'), eingabe)) });
    }
    return json({ ok: false, error: 'Nicht gefunden.' }, 404);
  } catch (fehler) {
    if (fehler instanceof EingabeFehler) return json({ ok: false, error: fehler.message }, 400);
    console.error('Hofladen – Fehler:', fehler);
    return json({ ok: false, error: 'Da ist etwas schiefgegangen – bitte ruft uns kurz an: +43 664 2166181.' }, 500);
  }
}
