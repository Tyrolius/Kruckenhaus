/* ============================================================
 * CLOUDFLARE PAGES FUNCTION – Schnittstelle der Hofladen-Verwaltung
 * ============================================================
 * Erreichbar unter /api/verwaltung/… – nur nach erfolgreicher
 * Zugangsprüfung (_middleware.js im selben Ordner).
 *
 *   GET  /api/verwaltung/stand                    alles, was die Oberfläche braucht
 *   POST /api/verwaltung/bestellung               Bestellung erfassen
 *   POST /api/verwaltung/bestellung/<id>          Bestellung ändern ({ aktion, … })
 *   POST /api/verwaltung/charge                   Charge anlegen
 *   POST /api/verwaltung/charge/<id>              Charge bearbeiten
 *   POST /api/verwaltung/voranmeldung             Voranmeldung erfassen
 *   POST /api/verwaltung/voranmeldung/<id>/absagen
 *   POST /api/verwaltung/voranmeldungen/uebernehmen
 *
 * POST nur mit Content-Type application/json – fremde Seiten können so
 * keine Änderungen im Namen eines angemeldeten Nutzers auslösen.
 * IDs gehen als Text an die Oberfläche und werden hier wieder geprüft.
 *
 * Binding: DB (D1 „kruckenhaus", Tabellen aus schema-hofladen.sql)
 * ============================================================ */

import {
  json, EingabeFehler, ZEITRAEUME,
  bestellungAnlegen, bestellungNachruecken, preisVorschlaege,
  voranmeldungAnlegen, voranmeldungenUebernehmen,
} from '../../_lib/hofladen.js';

/* ------------------------------------------------------------
   1. EINGABEN PRÜFEN
   ------------------------------------------------------------ */
const QUELLEN = ['web', 'whatsapp', 'telefon', 'persoenlich'];
const ZAHLARTEN = ['bar', 'ueberweisung'];
const CHARGE_STATUS = ['entwurf', 'stammkunden', 'offen', 'geschlossen', 'archiviert'];

function nummer(wert, name = 'Nummer') {
  const n = Number(wert);
  if (!Number.isInteger(n) || n <= 0) throw new EingabeFehler(`Ungültige ${name}.`);
  return n;
}

function ganzzahl(wert, name, { min = 0, max = 1e9, leer = false } = {}) {
  if (leer && (wert === null || wert === undefined || wert === '')) return null;
  const n = Number(wert);
  if (!Number.isInteger(n) || n < min || n > max) throw new EingabeFehler(`Ungültiger Wert: ${name}.`);
  return n;
}

const text = (wert, max = 500) => String(wert ?? '').trim().slice(0, max);
const textOderNull = (wert, max) => text(wert, max) || null;

function auswahl(wert, erlaubt, name) {
  if (!erlaubt.includes(wert)) throw new EingabeFehler(`Ungültige Auswahl: ${name}.`);
  return wert;
}

function datum(wert, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(wert || ''))) throw new EingabeFehler(`Ungültiges Datum: ${name}.`);
  return wert;
}

function uhrzeit(wert) {
  if (!wert) return null;
  if (!/^\d{2}:\d{2}$/.test(String(wert))) throw new EingabeFehler('Ungültige Uhrzeit.');
  return wert;
}

const id = (wert) => (wert == null ? null : String(wert));

/* ------------------------------------------------------------
   2. STAND LADEN (für die Oberfläche)
   Gleiche Form wie verwaltung/entwurf-daten.js.
   ------------------------------------------------------------ */
async function standLaden(db) {
  const aktiv = `SELECT id FROM chargen WHERE status <> 'archiviert'`;
  const [chargen, artikel, termine, bestellungen, positionen, kunden, produkte, voranmeldungen, liefergebiet] =
    (await db.batch([
      db.prepare(`SELECT id, titel, status, bestellschluss FROM chargen
                  WHERE status <> 'archiviert' ORDER BY bestellschluss, id`),
      db.prepare(`SELECT ca.id, ca.charge_id, ca.produkt_id, ca.preis_cent, ca.kontingent, ca.max_pro_bestellung,
                         p.name, p.art, p.richtgewicht_von_g, p.richtgewicht_bis_g
                  FROM charge_artikel ca JOIN produkte p ON p.id = ca.produkt_id
                  WHERE ca.charge_id IN (${aktiv})
                  ORDER BY p.kategorie, ca.reihenfolge, p.reihenfolge, p.name`),
      db.prepare(`SELECT id, charge_id, art, datum, von, bis, hinweis FROM termine
                  WHERE charge_id IN (${aktiv}) ORDER BY datum, von`),
      db.prepare(`SELECT id, nummer, charge_id, kunde_id, quelle, status, termin_id, lieferadresse, zahlart,
                         uebergeben_am, bezahlt_art, anmerkung, interne_notiz, erstellt_am
                  FROM bestellungen WHERE charge_id IN (${aktiv}) ORDER BY id`),
      db.prepare(`SELECT p.id, p.bestellung_id, p.charge_artikel_id, p.menge, p.einzelpreis_cent, p.gewicht_g
                  FROM bestell_positionen p JOIN bestellungen b ON b.id = p.bestellung_id
                  WHERE b.charge_id IN (${aktiv}) ORDER BY p.id`),
      db.prepare(`SELECT id, name, telefon, email, strasse, plz, ort, stammkunde, notiz FROM kunden ORDER BY name`),
      db.prepare(`SELECT id, name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent,
                         aktiv, beschreibung
                  FROM produkte ORDER BY kategorie, reihenfolge, name`),
      db.prepare(`SELECT id, kunde_id, produkt_id, menge, zeitraum, jahr, quelle, status, notiz, erstellt_am
                  FROM voranmeldungen WHERE status = 'offen' ORDER BY erstellt_am, id`),
      db.prepare(`SELECT plz, ort, liefergebuehr_cent, gratis_ab_cent FROM liefergebiet ORDER BY tour_reihenfolge, ort`),
    ])).map((r) => r.results);

  const jePos = new Map();
  for (const p of positionen) {
    if (!jePos.has(p.bestellung_id)) jePos.set(p.bestellung_id, []);
    jePos.get(p.bestellung_id).push({
      id: id(p.id), artikelId: id(p.charge_artikel_id), menge: p.menge,
      einzelpreisCent: p.einzelpreis_cent, gewichtG: p.gewicht_g ?? undefined,
    });
  }

  return {
    chargen: chargen.map((c) => ({
      id: id(c.id), titel: c.titel, status: c.status, bestellschluss: c.bestellschluss,
      termine: termine.filter((t) => t.charge_id === c.id).map((t) => ({
        id: id(t.id), art: t.art, datum: t.datum, von: t.von || '', bis: t.bis || '', hinweis: t.hinweis || '',
      })),
      artikel: artikel.filter((a) => a.charge_id === c.id).map((a) => ({
        id: id(a.id), produktId: id(a.produkt_id), name: a.name, art: a.art, preisCent: a.preis_cent,
        kontingent: a.kontingent, maxProBestellung: a.max_pro_bestellung,
        richtVonG: a.richtgewicht_von_g, richtBisG: a.richtgewicht_bis_g,
      })),
    })),
    kunden: kunden.map((k) => ({
      id: id(k.id), name: k.name, telefon: k.telefon || '', email: k.email || '', strasse: k.strasse || '',
      plz: k.plz || '', ort: k.ort || '', stammkunde: Boolean(k.stammkunde), notiz: k.notiz || '',
    })),
    bestellungen: bestellungen.map((b) => ({
      id: id(b.id), nummer: b.nummer, chargeId: id(b.charge_id), kundeId: id(b.kunde_id), quelle: b.quelle,
      erstellt: String(b.erstellt_am).slice(0, 10), status: b.status, terminId: id(b.termin_id),
      lieferadresse: b.lieferadresse || '', zahlart: b.zahlart, bezahlt: b.bezahlt_art || null,
      uebergeben: Boolean(b.uebergeben_am), anmerkung: b.anmerkung || '', interneNotiz: b.interne_notiz || '',
      positionen: jePos.get(b.id) || [],
    })),
    produkte: produkte.map((p) => ({
      id: id(p.id), name: p.name, art: p.art, kategorie: p.kategorie, aktiv: Boolean(p.aktiv),
      richtVonG: p.richtgewicht_von_g, richtBisG: p.richtgewicht_bis_g, startpreisCent: p.startpreis_cent,
      beschreibung: p.beschreibung || '',
    })),
    voranmeldungen: voranmeldungen.map((v) => ({
      id: id(v.id), kundeId: id(v.kunde_id), produktId: id(v.produkt_id), menge: v.menge,
      zeitraum: v.zeitraum, jahr: v.jahr, quelle: v.quelle, status: v.status, notiz: v.notiz || '',
      erstellt: String(v.erstellt_am).slice(0, 10),
    })),
    liefergebiet: liefergebiet.map((l) => ({
      plz: l.plz, ort: l.ort, liefergebuehrCent: l.liefergebuehr_cent, gratisAbCent: l.gratis_ab_cent,
    })),
    tourReihenfolge: liefergebiet.map((l) => l.ort),
    preisVorschlaege: (await preisVorschlaege(db)).map((v) => ({
      produktId: id(v.produktId), preisCent: v.preisCent, kontingent: v.kontingent,
      maxProBestellung: v.maxProBestellung, ausCharge: v.ausCharge || '',
    })),
  };
}

/* ------------------------------------------------------------
   3. KUNDEN
   Bestehender Kunde (kundeId): Kontaktdaten nur ergänzen/aktualisieren,
   wenn etwas eingetragen wurde. Sonst neuen Kunden anlegen.
   ------------------------------------------------------------ */
async function kundeSichern(db, kundeId, kunde = {}) {
  const felder = {
    telefon: textOderNull(kunde.telefon, 40),
    strasse: textOderNull(kunde.strasse, 120),
    plz: textOderNull(kunde.plz, 10),
    ort: textOderNull(kunde.ort, 80),
  };
  if (kundeId) {
    const kid = nummer(kundeId, 'Kundennummer');
    const r = await db.prepare(
      `UPDATE kunden SET telefon = COALESCE(?, telefon), strasse = COALESCE(?, strasse),
              plz = COALESCE(?, plz), ort = COALESCE(?, ort)
       WHERE id = ?`
    ).bind(felder.telefon, felder.strasse, felder.plz, felder.ort, kid).run();
    if (!r.meta.changes) throw new EingabeFehler('Kunde nicht gefunden.');
    return kid;
  }
  const name = text(kunde.name, 120);
  if (!name) throw new EingabeFehler('Bitte einen Namen eintragen.');
  const zeile = await db.prepare(
    'INSERT INTO kunden (name, telefon, strasse, plz, ort) VALUES (?, ?, ?, ?, ?) RETURNING id'
  ).bind(name, felder.telefon, felder.strasse, felder.plz, felder.ort).first();
  return zeile.id;
}

/* ------------------------------------------------------------
   4. BESTELLUNGEN
   ------------------------------------------------------------ */
async function bestellungErfassen(db, e) {
  const chargeId = nummer(e.chargeId, 'Charge');
  const terminId = e.terminId ? nummer(e.terminId, 'Termin') : null;
  let lieferadresse = null;
  if (terminId) {
    const termin = await db.prepare('SELECT art FROM termine WHERE id = ? AND charge_id = ?').bind(terminId, chargeId).first();
    if (!termin) throw new EingabeFehler('Termin gehört nicht zu dieser Charge.');
    if (termin.art === 'lieferung') {
      const k = e.kunde || {};
      if (!text(k.strasse) || !text(k.ort)) throw new EingabeFehler('Für die Lieferung bitte Adresse eintragen.');
      lieferadresse = `${text(k.strasse, 120)}, ${`${text(k.plz, 10)} ${text(k.ort, 80)}`.trim()}`;
    }
  }
  const kundeId = await kundeSichern(db, e.kundeId, e.kunde);
  return bestellungAnlegen(db, {
    chargeId,
    kundeId,
    terminId,
    quelle: auswahl(e.quelle || 'telefon', QUELLEN, 'Quelle'),
    zahlart: auswahl(e.zahlart || 'bar', ZAHLARTEN, 'Zahlart'),
    lieferadresse,
    anmerkung: textOderNull(e.anmerkung, 1000),
    positionen: (e.positionen || []).map((p) => ({
      chargeArtikelId: nummer(p.artikelId, 'Artikelnummer'),
      menge: ganzzahl(p.menge, 'Menge', { min: 0, max: 999 }),
    })),
  }, { hoechstmengeIgnorieren: true });
}

async function bestellungAendern(db, bestellungId, e) {
  const bid = nummer(bestellungId, 'Bestellnummer');
  const aenderung = (sql, ...werte) => db.prepare(
    `UPDATE bestellungen SET ${sql}, geaendert_am = datetime('now') WHERE id = ?`
  ).bind(...werte, bid).run();

  let r;
  switch (e.aktion) {
    case 'uebergeben':
      r = await aenderung(`uebergeben_am = ${e.wert ? "datetime('now')" : 'NULL'}`);
      break;
    case 'bezahlt':
      if (e.art) {
        r = await aenderung(
          `bezahlt_am = datetime('now'), bezahlt_art = ?,
           bezahlt_betrag_cent = (SELECT gesamt_cent FROM v_bestellsummen WHERE bestellung_id = bestellungen.id)`,
          auswahl(e.art, ZAHLARTEN, 'Zahlart')
        );
      } else {
        r = await aenderung('bezahlt_am = NULL, bezahlt_art = NULL, bezahlt_betrag_cent = NULL');
      }
      break;
    case 'zahlart':
      r = await aenderung('zahlart = ?', auswahl(e.zahlart, ZAHLARTEN, 'Zahlart'));
      break;
    case 'termin': {
      const tid = nummer(e.terminId, 'Termin');
      r = await db.prepare(
        `UPDATE bestellungen SET termin_id = ?, geaendert_am = datetime('now')
         WHERE id = ? AND EXISTS (SELECT 1 FROM termine t WHERE t.id = ? AND t.charge_id = bestellungen.charge_id)`
      ).bind(tid, bid, tid).run();
      if (!r.meta.changes) throw new EingabeFehler('Termin gehört nicht zu dieser Charge.');
      break;
    }
    case 'notiz':
      r = await aenderung('interne_notiz = ?', textOderNull(e.text, 1000));
      break;
    case 'stornieren':
      r = await aenderung(`status = 'storniert'`);
      break;
    case 'nachruecken':
      return { bestellung: await bestellungNachruecken(db, bid) };
    case 'gewicht': {
      const gewichtG = ganzzahl(e.gewichtG, 'Gewicht', { min: 1, max: 200000, leer: true });
      r = await db.prepare(
        `UPDATE bestell_positionen SET gewicht_g = ?
         WHERE id = ? AND bestellung_id = ? AND charge_artikel_id IN (
           SELECT ca.id FROM charge_artikel ca JOIN produkte p ON p.id = ca.produkt_id WHERE p.art = 'gewicht')`
      ).bind(gewichtG, nummer(e.positionId, 'Position'), bid).run();
      if (!r.meta.changes) throw new EingabeFehler('Position nicht gefunden oder keine Gewichtsware.');
      break;
    }
    default:
      throw new EingabeFehler('Unbekannte Aktion.');
  }
  if (!r.meta.changes) throw new EingabeFehler('Bestellung nicht gefunden.');
  return {};
}

/* ------------------------------------------------------------
   5. CHARGEN
   Termine und Artikel werden als vollständige Liste geschickt: mit id =
   ändern, ohne id = neu, fehlend = entfernen (nur wenn noch unbenutzt).
   ------------------------------------------------------------ */
function chargePruefen(e) {
  const titel = text(e.titel, 120);
  if (!titel) throw new EingabeFehler('Bitte einen Titel eintragen.');
  const termine = (e.termine || []).map((t) => ({
    id: t.id ? nummer(t.id, 'Termin') : null,
    art: auswahl(t.art, ['abholung', 'lieferung'], 'Terminart'),
    datum: datum(t.datum, 'Termin'),
    von: uhrzeit(t.von),
    bis: uhrzeit(t.bis),
    hinweis: textOderNull(t.hinweis, 200),
  }));
  const artikel = (e.artikel || []).map((a) => ({
    id: a.id ? nummer(a.id, 'Artikel') : null,
    produktId: nummer(a.produktId, 'Produkt'),
    preisCent: ganzzahl(a.preisCent, 'Preis', { max: 10000000 }),
    kontingent: ganzzahl(a.kontingent, 'Menge', { max: 100000 }),
    max: ganzzahl(a.maxProBestellung, 'Höchstmenge', { min: 1, max: 100000, leer: true }),
  }));
  if (new Set(artikel.map((a) => a.produktId)).size !== artikel.length) {
    throw new EingabeFehler('Ein Produkt ist doppelt in der Charge.');
  }
  return {
    titel,
    bestellschluss: datum(e.bestellschluss, 'Bestellschluss'),
    status: auswahl(e.status || 'entwurf', CHARGE_STATUS, 'Status'),
    beschreibung: textOderNull(e.beschreibung, 1000),
    termine,
    artikel,
  };
}

function terminEinfuegen(db, chargeId, t) {
  return db.prepare('INSERT INTO termine (charge_id, art, datum, von, bis, hinweis) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(chargeId, t.art, t.datum, t.von, t.bis, t.hinweis);
}

function artikelEinfuegen(db, chargeId, a, reihenfolge) {
  return db.prepare(
    `INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent, max_pro_bestellung, reihenfolge)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(chargeId, a.produktId, a.preisCent, a.kontingent, a.max, reihenfolge);
}

async function chargeAnlegen(db, e) {
  const c = chargePruefen(e);
  const zeile = await db.prepare(
    'INSERT INTO chargen (titel, beschreibung, status, bestellschluss) VALUES (?, ?, ?, ?) RETURNING id'
  ).bind(c.titel, c.beschreibung, c.status, c.bestellschluss).first();
  const anweisungen = [
    ...c.termine.map((t) => terminEinfuegen(db, zeile.id, t)),
    ...c.artikel.map((a, i) => artikelEinfuegen(db, zeile.id, a, i)),
  ];
  try {
    if (anweisungen.length) await db.batch(anweisungen);
  } catch (fehler) {
    await db.prepare('DELETE FROM chargen WHERE id = ?').bind(zeile.id).run();
    throw fehler;
  }
  return { chargeId: id(zeile.id) };
}

async function chargeBearbeiten(db, chargeId, e) {
  const cid = nummer(chargeId, 'Charge');
  const c = chargePruefen(e);
  const vorhanden = await db.prepare('SELECT id FROM chargen WHERE id = ?').bind(cid).first();
  if (!vorhanden) throw new EingabeFehler('Charge nicht gefunden.');

  const [alteTermine, alteArtikel] = (await db.batch([
    db.prepare(`SELECT t.id, EXISTS (SELECT 1 FROM bestellungen b WHERE b.termin_id = t.id) AS benutzt
                FROM termine t WHERE t.charge_id = ?`).bind(cid),
    db.prepare(`SELECT ca.id, EXISTS (SELECT 1 FROM bestell_positionen p WHERE p.charge_artikel_id = ca.id) AS benutzt
                FROM charge_artikel ca WHERE ca.charge_id = ?`).bind(cid),
  ])).map((r) => r.results);

  const bleibendeTermine = new Set(c.termine.filter((t) => t.id).map((t) => t.id));
  const bleibendeArtikel = new Set(c.artikel.filter((a) => a.id).map((a) => a.id));
  for (const t of c.termine) {
    if (t.id && !alteTermine.some((x) => x.id === t.id)) throw new EingabeFehler('Termin gehört nicht zu dieser Charge.');
  }
  for (const a of c.artikel) {
    if (a.id && !alteArtikel.some((x) => x.id === a.id)) throw new EingabeFehler('Artikel gehört nicht zu dieser Charge.');
  }
  const entfernteTermine = alteTermine.filter((t) => !bleibendeTermine.has(t.id));
  const entfernteArtikel = alteArtikel.filter((a) => !bleibendeArtikel.has(a.id));
  if (entfernteTermine.some((t) => t.benutzt)) throw new EingabeFehler('Ein Termin hat schon Bestellungen und kann nicht entfernt werden.');
  if (entfernteArtikel.some((a) => a.benutzt)) throw new EingabeFehler('Ein Artikel wurde schon bestellt und kann nicht entfernt werden – Menge stattdessen auf die bestellte Zahl setzen.');

  await db.batch([
    db.prepare('UPDATE chargen SET titel = ?, beschreibung = ?, status = ?, bestellschluss = ? WHERE id = ?')
      .bind(c.titel, c.beschreibung, c.status, c.bestellschluss, cid),
    ...entfernteTermine.map((t) => db.prepare('DELETE FROM termine WHERE id = ? AND charge_id = ?').bind(t.id, cid)),
    ...entfernteArtikel.map((a) => db.prepare('DELETE FROM charge_artikel WHERE id = ? AND charge_id = ?').bind(a.id, cid)),
    ...c.termine.map((t) => (t.id
      ? db.prepare('UPDATE termine SET art = ?, datum = ?, von = ?, bis = ?, hinweis = ? WHERE id = ? AND charge_id = ?')
        .bind(t.art, t.datum, t.von, t.bis, t.hinweis, t.id, cid)
      : terminEinfuegen(db, cid, t))),
    // Preisänderungen gelten nur für neue Bestellungen (Einzelpreis ist je Position gespeichert)
    ...c.artikel.map((a, i) => (a.id
      ? db.prepare(`UPDATE charge_artikel SET preis_cent = ?, kontingent = ?, max_pro_bestellung = ?, reihenfolge = ?
                    WHERE id = ? AND charge_id = ?`).bind(a.preisCent, a.kontingent, a.max, i, a.id, cid)
      : artikelEinfuegen(db, cid, a, i))),
  ]);
  return { chargeId: id(cid) };
}

/* ------------------------------------------------------------
   6. VORANMELDUNGEN
   ------------------------------------------------------------ */
async function voranmeldungErfassen(db, e) {
  const kundeId = await kundeSichern(db, e.kundeId, e.kunde);
  const zeitraum = e.zeitraum;
  if (!ZEITRAEUME[zeitraum]) throw new EingabeFehler('Ungültiger Zeitraum.');
  const neueId = await voranmeldungAnlegen(db, {
    kundeId,
    produktId: nummer(e.produktId, 'Produkt'),
    menge: e.menge,
    zeitraum,
    jahr: e.jahr,
    quelle: auswahl(e.quelle || 'telefon', QUELLEN, 'Quelle'),
    notiz: textOderNull(e.notiz, 500),
  });
  return { voranmeldungId: id(neueId) };
}

/* ------------------------------------------------------------
   7. VERTEILER
   ------------------------------------------------------------ */
export async function onRequest({ request, env, params, data }) {
  if (!env.DB) return json({ ok: false, error: 'Datenbank nicht verbunden.' }, 503);
  const db = env.DB;
  const pfad = [].concat(params.pfad || []);
  const [bereich, teilId, unteraktion] = pfad;

  try {
    if (request.method === 'GET' && bereich === 'stand' && pfad.length === 1) {
      return json({ ok: true, nutzer: data.nutzer, ...(await standLaden(db)) });
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'Nicht gefunden.' }, 404);
    if (!(request.headers.get('content-type') || '').includes('application/json')) {
      return json({ ok: false, error: 'Nur JSON-Anfragen.' }, 415);
    }
    const eingabe = await request.json().catch(() => {
      throw new EingabeFehler('Ungültige Anfrage.');
    });

    let ergebnis;
    if (bereich === 'bestellung' && pfad.length === 1) ergebnis = { bestellung: await bestellungErfassen(db, eingabe) };
    else if (bereich === 'bestellung' && pfad.length === 2) ergebnis = await bestellungAendern(db, teilId, eingabe);
    else if (bereich === 'charge' && pfad.length === 1) ergebnis = await chargeAnlegen(db, eingabe);
    else if (bereich === 'charge' && pfad.length === 2) ergebnis = await chargeBearbeiten(db, teilId, eingabe);
    else if (bereich === 'voranmeldung' && pfad.length === 1) ergebnis = await voranmeldungErfassen(db, eingabe);
    else if (bereich === 'voranmeldung' && unteraktion === 'absagen' && pfad.length === 3) {
      const r = await db.prepare(
        `UPDATE voranmeldungen SET status = 'abgesagt', geaendert_am = datetime('now') WHERE id = ? AND status = 'offen'`
      ).bind(nummer(teilId, 'Voranmeldung')).run();
      if (!r.meta.changes) throw new EingabeFehler('Voranmeldung nicht gefunden oder nicht mehr offen.');
      ergebnis = {};
    } else if (bereich === 'voranmeldungen' && teilId === 'uebernehmen' && pfad.length === 2) {
      const erg = await voranmeldungenUebernehmen(db, nummer(eingabe.chargeId, 'Charge'), eingabe.ids || []);
      ergebnis = {
        bestellungen: erg.bestellungen.map((b) => ({ id: id(b.id), nummer: b.nummer, status: b.status })),
        uebersprungen: erg.uebersprungen.map(id),
      };
    } else {
      return json({ ok: false, error: 'Nicht gefunden.' }, 404);
    }
    return json({ ok: true, ...ergebnis });
  } catch (fehler) {
    if (fehler instanceof EingabeFehler) return json({ ok: false, error: fehler.message }, 400);
    const meldung = String(fehler && fehler.message);
    if (/UNIQUE|CHECK|FOREIGN KEY/.test(meldung)) {
      console.error('Datenbank hat Eingabe abgelehnt:', meldung);
      return json({ ok: false, error: 'Die Eingabe passt nicht zu den gespeicherten Daten.' }, 400);
    }
    console.error('Verwaltung – Fehler:', fehler);
    return json({ ok: false, error: 'Interner Fehler – bitte später noch einmal versuchen.' }, 500);
  }
}
