/* ============================================================
 * CLOUDFLARE PAGES FUNCTION – Schnittstelle für Bertha, Version 1
 * ============================================================
 * Plan: docs/SCHNITTSTELLE-BERTHA.md, Abschnitt 3. Nur nach der
 * Zugangsprüfung in ../_middleware.js (Zugang in context.data.zugang).
 *
 *   GET /api/extern/v1/ping      Verbindung testen: Name des Zugangs,
 *                                Rechte, Serverzeit (ohne besonderes Recht)
 *   GET /api/extern/v1/katalog   Recht „katalog": alle eingeblendeten
 *                                Dauerartikel mit „Auch im Bertha-Portal",
 *                                auch ausverkaufte (verfuegbar: false).
 *                                Mit ETag – bei If-None-Match ohne Änderung 304.
 *
 *   GET  /api/extern/v1/angebot      Recht „angebot": offene Fleischrunden mit
 *                                    „Auch im Bertha-Portal" (Artikel, freie
 *                                    Menge, Termine, Liefergebiet)
 *   POST /api/extern/v1/bestellungen Recht „bestellen": Fleischbestellung aus dem
 *                                    Portal anlegen. Header Idempotency-Key
 *                                    Pflicht – Wiederholung liefert dieselbe
 *                                    Antwort (200) statt einer zweiten Bestellung.
 *
 * Später: GET /bestellungen?kunde=… (Bestellstand).
 *
 * Fehlerformat: { ok: false, fehler: { code, text } }
 * Versionierung: /v1/ bleibt stabil, neue Felder kommen nur hinzu.
 *
 * Binding: DB (D1). Optional für die Mails: RESEND_API_KEY, CONTACT_TO,
 * CONTACT_FROM – fehlen sie, wird trotzdem gespeichert.
 * ============================================================ */

import { externJson, externFehler } from '../../../_lib/extern.js';
import {
  sha256Hex, positionBetrag, bestellungAnlegen, kundenLinkErstellen, EingabeFehler,
} from '../../../_lib/hofladen.js';
import {
  ZAHLARTEN, MAX_ANFRAGE_BYTES, text, heuteInTirol, kontaktPruefen, kundeFinden, linkAdresse, bestellMailsSenden,
} from '../../../_lib/bestellung.js';
import { terminText } from '../../../_lib/mail.js';

const EINHEITEN = { stueck: 'Stück', paket: 'Paket' };

// D1-Zeitpunkt „2026-10-12 17:40:00" (UTC) → „2026-10-12T17:40:00Z"
const isoZeit = (sql) => (sql ? `${String(sql).replace(' ', 'T')}Z` : null);

function rechtFehlt(context, recht) {
  if (context.data.zugang.rechte.includes(recht)) return null;
  context.data.fehlercode = 'keine_berechtigung';
  return externFehler('keine_berechtigung');
}

/* ------------------------------------------------------------
   PING
   ------------------------------------------------------------ */
function ping(context) {
  const { zugang } = context.data;
  return externJson({
    ok: true,
    version: 'v1',
    zugang: zugang.name,
    rechte: zugang.rechte,
    serverzeit: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------
   KATALOG
   Ausgeblendete oder nicht mehr „Dauerartikel" fehlen einfach – Bertha
   blendet sie dann aus (alte Lieferscheine verweisen noch darauf).
   bild_version ändert sich mit dem Foto: Bertha kopiert es nur dann neu.
   ------------------------------------------------------------ */
async function katalog(context) {
  const db = context.env.DB;
  const origin = new URL(context.request.url).origin;
  const { results } = await db.prepare(
    `SELECT id, name, art, bereich_name, dauerpreis_cent, verfuegbar, beschreibung, pflichtangaben,
            allergene, bild, geaendert_am
     FROM v_produkte
     WHERE verkaufsart = 'dauer' AND aktiv = 1 AND im_portal = 1 AND dauerpreis_cent IS NOT NULL
     ORDER BY bereich_reihenfolge, reihenfolge, name`
  ).all();

  const artikel = results.map((p) => {
    const eigenesFoto = /^api\/hofladen\/foto\/(\d+)$/.exec(p.bild || '');
    return {
      id: p.id,
      name: p.name,
      bereich: p.bereich_name || '',
      preis_cent: p.dauerpreis_cent,
      einheit: EINHEITEN[p.art] || 'Stück',
      verfuegbar: Boolean(p.verfuegbar),
      beschreibung: p.beschreibung || '',
      pflichtangaben: p.pflichtangaben || '',
      allergene: p.allergene || '',
      bild_url: p.bild ? `${origin}/${encodeURI(p.bild)}` : null,
      bild_version: p.bild ? (eigenesFoto ? eigenesFoto[1] : p.bild) : null,
      geaendert_am: isoZeit(p.geaendert_am),
    };
  });
  const stand = artikel.reduce((max, a) => (a.geaendert_am && (!max || a.geaendert_am > max) ? a.geaendert_am : max), null);
  const text = JSON.stringify({ ok: true, stand, artikel });

  // ETag aus dem Inhalt: unverändert → 304 ohne Inhalt
  const etag = `W/"${(await sha256Hex(text)).slice(0, 32)}"`;
  const bekannt = (context.request.headers.get('if-none-match') || '').split(',').map((x) => x.trim());
  if (bekannt.includes(etag)) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-store' } });
  }
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ETag: etag,
    },
  });
}

/* ------------------------------------------------------------
   ANGEBOT (Phase W4)
   Offene Fleischrunden mit „Auch im Bertha-Portal": Artikel mit freier
   Menge, Termine, Liefergebiet. Bertha darf das höchstens 60 Sekunden
   zwischenspeichern – verbindlich prüft erst POST /bestellungen.
   Runden „nur Stammkunden" sind (noch) nicht dabei.
   ------------------------------------------------------------ */
const PREIS_JE = { gewicht: 'kg', paket: 'Paket', stueck: 'Stück' };

async function angebot(context) {
  const db = context.env.DB;
  const origin = new URL(context.request.url).origin;
  const heute = heuteInTirol();
  const offen = `SELECT id FROM chargen WHERE art = 'runde' AND status = 'offen' AND im_portal = 1 AND bestellschluss >= ?`;
  const [runden, artikel, termine, liefergebiet] = (await db.batch([
    db.prepare(`SELECT id, titel, beschreibung, bestellschluss FROM chargen WHERE id IN (${offen})
                ORDER BY bestellschluss, id`).bind(heute),
    db.prepare(`SELECT ca.id, ca.charge_id, ca.produkt_id, ca.preis_cent, ca.max_pro_bestellung, v.frei,
                       p.name, p.art, p.bereich_name, p.beschreibung, p.pflichtangaben, p.allergene,
                       p.richtgewicht_von_g, p.richtgewicht_bis_g, p.bild
                FROM charge_artikel ca
                JOIN v_produkte p ON p.id = ca.produkt_id
                JOIN v_bestand v ON v.charge_artikel_id = ca.id
                WHERE ca.charge_id IN (${offen})
                ORDER BY p.bereich_reihenfolge, ca.reihenfolge, p.reihenfolge, p.name`).bind(heute),
    db.prepare(`SELECT id, charge_id, art, datum, von, bis, hinweis FROM termine
                WHERE charge_id IN (${offen}) ORDER BY datum, von`).bind(heute),
    db.prepare('SELECT plz, ort FROM liefergebiet ORDER BY tour_reihenfolge, ort'),
  ])).map((r) => r.results);

  return externJson({
    ok: true,
    stand: new Date().toISOString(),
    bestellbedingungen_url: `${origin}/hofladen.html#bedingungen`,
    liefergebiet: liefergebiet.map((l) => ({ plz: l.plz, ort: l.ort })),
    runden: runden.map((r) => ({
      id: r.id,
      titel: r.titel,
      beschreibung: r.beschreibung || '',
      bestellschluss: r.bestellschluss,
      termine: termine.filter((t) => t.charge_id === r.id).map((t) => ({
        id: t.id, art: t.art, datum: t.datum, von: t.von || '', bis: t.bis || '', hinweis: t.hinweis || '',
        text: terminText(t),
      })),
      artikel: artikel.filter((a) => a.charge_id === r.id).map((a) => ({
        id: a.id,
        produkt_id: a.produkt_id,
        name: a.name,
        bereich: a.bereich_name || '',
        art: a.art,
        preis_cent: a.preis_cent,
        preis_je: PREIS_JE[a.art] || 'Stück',
        // Gewichtsware: „ca."-Preis je Stück aus dem mittleren Richtgewicht
        ca_preis_je_stueck_cent: a.art === 'gewicht' ? positionBetrag({
          art: a.art, preisCent: a.preis_cent, menge: 1, richtVonG: a.richtgewicht_von_g, richtBisG: a.richtgewicht_bis_g,
        }).cent : null,
        richtgewicht_von_g: a.richtgewicht_von_g,
        richtgewicht_bis_g: a.richtgewicht_bis_g,
        frei: Math.max(0, a.frei),
        max_pro_bestellung: a.max_pro_bestellung,
        beschreibung: a.beschreibung || '',
        pflichtangaben: a.pflichtangaben || '',
        allergene: a.allergene || '',
        bild_url: a.bild ? `${origin}/${encodeURI(a.bild)}` : null,
      })),
    })),
  });
}

/* ------------------------------------------------------------
   BESTELLUNGEN (Phase W4)
   Fleischbestellung aus dem Portal anlegen – mit denselben Prüfungen,
   derselben Kundenzuordnung und denselben Mails wie hofladen.html
   (functions/_lib/bestellung.js). Ablauf (Plan, Abschnitt 3.4):
     1. Idempotency-Key schon bekannt → gespeicherte Antwort, nichts neu
     2. Eingaben prüfen: Kontakt, Zustimmung, Runde offen + im Portal,
        Termin, Liefergebiet, Artikel, Höchstmengen
     3. Limits: je Zugang 30 Bestellungen pro Stunde, je Bertha-Kunde
        höchstens 3 offene Bestellungen pro Runde
     4. Kunde: zuerst über extern_kunden, sonst über die E-Mail
     5. bestellungAnlegen() – überbuchungssicher, sonst Warteliste;
        extern_anfragen in derselben Transaktion
     6. Antwort speichern, Mails an Kunde und Hof
   Ausverkauft ist kein Fehler: die Bestellung kommt auf die Warteliste.
   ------------------------------------------------------------ */
const IDEMPOTENZ_MUSTER = /^[A-Za-z0-9_-]{8,100}$/;
const EXTERNE_ID_MUSTER = /^[A-Za-z0-9_.:-]{1,100}$/;
const LIMIT_PRO_STUNDE = 30;
const LIMIT_OFFEN_JE_KUNDE_RUNDE = 3;

const ganzeZahl = (wert) => (Number.isInteger(Number(wert)) && Number(wert) > 0 ? Number(wert) : -1);

// Antwort auf eine angelegte Bestellung (auch für Wiederholungen)
async function bestellAntwort(db, bestellungId) {
  const b = await db.prepare(
    `SELECT b.nummer, b.status, s.gesamt_cent, s.geschaetzt, t.art, t.datum, t.von, t.bis
     FROM bestellungen b JOIN v_bestellsummen s ON s.bestellung_id = b.id
     LEFT JOIN termine t ON t.id = b.termin_id WHERE b.id = ?`
  ).bind(bestellungId).first();
  const warteliste = b.status === 'warteliste';
  return {
    ok: true,
    nummer: b.nummer,
    status: b.status,
    summe_ca_cent: b.gesamt_cent,
    geschaetzt: Boolean(b.geschaetzt),
    termin: terminText(b.datum ? { art: b.art, datum: b.datum, von: b.von, bis: b.bis } : null),
    hinweis: warteliste
      ? 'Leider ausverkauft – ihr steht auf der Warteliste. Sobald etwas frei wird, melden wir uns.'
      : b.geschaetzt
        ? 'Den genauen Betrag erfahrt ihr bei der Übergabe.'
        : 'Die Bestätigung kommt per E-Mail von kruckenhaus.at.',
  };
}

// Schon bearbeitete Anfrage: gespeicherte Antwort (200). Fehlt sie, obwohl
// die Bestellung angelegt ist (Abbruch genau dazwischen), wird sie aus der
// Bestellung neu gebaut; ohne Bestellung läuft die Anfrage noch → 409.
async function gespeicherteAntwort(context, anfrageId) {
  const db = context.env.DB;
  const zeile = await db.prepare(
    'SELECT antwort, bestellung_id FROM extern_anfragen WHERE zugang_id = ? AND anfrage_id = ?'
  ).bind(context.data.zugang.id, anfrageId).first();
  if (!zeile) return null;
  let antwort = zeile.antwort ? JSON.parse(zeile.antwort) : null;
  if (!antwort && zeile.bestellung_id) antwort = await bestellAntwort(db, zeile.bestellung_id);
  if (!antwort) {
    context.data.fehlercode = 'in_bearbeitung';
    return externFehler('in_bearbeitung');
  }
  return externJson(antwort, 200, { 'Idempotent-Replayed': 'true' });
}

// Bertha-Kunde ↔ Website-Kunde. Vorhandene Angaben werden nie
// überschrieben, nur leere Felder ergänzt.
async function externerKunde(db, zugangId, externeId, kontakt) {
  const zuordnung = await db.prepare('SELECT kunde_id FROM extern_kunden WHERE zugang_id = ? AND externe_id = ?')
    .bind(zugangId, externeId).first();
  if (zuordnung) {
    await db.prepare(
      `UPDATE kunden SET email = COALESCE(email, ?), telefon = COALESCE(telefon, ?), strasse = COALESCE(strasse, ?),
              plz = COALESCE(plz, ?), ort = COALESCE(ort, ?) WHERE id = ?`
    ).bind(kontakt.email, kontakt.telefon || null, kontakt.strasse || null, kontakt.plz || null, kontakt.ort || null,
      zuordnung.kunde_id).run();
    return zuordnung.kunde_id;
  }
  const kundeId = await kundeFinden(db, kontakt);
  await db.prepare('INSERT OR IGNORE INTO extern_kunden (zugang_id, externe_id, kunde_id) VALUES (?, ?, ?)')
    .bind(zugangId, externeId, kundeId).run();
  return kundeId;
}

async function bestellen(context) {
  const { request, env } = context;
  const db = env.DB;
  const zugang = context.data.zugang;
  const fehler = (code, textFehler) => {
    context.data.fehlercode = code;
    return externFehler(code, textFehler);
  };

  // 1. Wiederholung?
  const anfrageId = request.headers.get('idempotency-key') || '';
  if (!IDEMPOTENZ_MUSTER.test(anfrageId)) return fehler('ungueltig', 'Header Idempotency-Key fehlt oder ist ungültig.');
  const wiederholung = await gespeicherteAntwort(context, anfrageId);
  if (wiederholung) return wiederholung;

  // 2. Eingaben
  if (!(request.headers.get('content-type') || '').includes('application/json')) return fehler('ungueltig', 'Nur JSON.');
  const roh = await request.text();
  if (roh.length > MAX_ANFRAGE_BYTES) return fehler('zu_gross');
  let e;
  try { e = JSON.parse(roh); } catch { return fehler('ungueltig', 'Ungültiges JSON.'); }
  if (!e || typeof e !== 'object') return fehler('ungueltig');

  const k = e.kunde && typeof e.kunde === 'object' ? e.kunde : {};
  const externeId = String(k.externe_id || '');
  if (!EXTERNE_ID_MUSTER.test(externeId)) return fehler('ungueltig', 'kunde.externe_id fehlt oder ist ungültig.');
  let kontakt;
  try {
    kontakt = kontaktPruefen(k);
  } catch (f) {
    if (f instanceof EingabeFehler) return fehler('ungueltig', f.message);
    throw f;
  }
  const z = e.zustimmung && typeof e.zustimmung === 'object' ? e.zustimmung : {};
  const zustimmung = { bestellbedingungen: text(z.bestellbedingungen, 20), zeitpunkt: text(z.zeitpunkt, 40) };
  if (!zustimmung.bestellbedingungen || Number.isNaN(Date.parse(zustimmung.zeitpunkt))) {
    return fehler('ungueltig', 'Die Zustimmung zu den Bestellbedingungen fehlt (Version und Zeitpunkt).');
  }

  const runde = await db.prepare('SELECT id, titel, art, status, bestellschluss, im_portal FROM chargen WHERE id = ?')
    .bind(ganzeZahl(e.runde_id)).first();
  if (!runde || runde.art !== 'runde' || runde.status === 'entwurf' || runde.status === 'stammkunden') {
    return fehler('nicht_gefunden', 'Diese Bestellrunde gibt es nicht.');
  }
  if (runde.status !== 'offen' || runde.bestellschluss < heuteInTirol()) return fehler('bestellschluss');
  if (!runde.im_portal) return fehler('nicht_im_portal');

  const termin = await db.prepare('SELECT id, art, datum, von, bis FROM termine WHERE id = ? AND charge_id = ?')
    .bind(ganzeZahl(e.termin_id), runde.id).first();
  if (!termin) return fehler('nicht_gefunden', 'Diesen Abhol- oder Liefertermin gibt es nicht (mehr).');
  let lieferadresse = null;
  if (termin.art === 'lieferung') {
    const gebiet = await db.prepare('SELECT ort FROM liefergebiet WHERE plz = ?').bind(kontakt.plz).first();
    if (!gebiet) return fehler('ausserhalb_liefergebiet');
    if (!kontakt.strasse || !kontakt.ort) return fehler('ungueltig', 'Bitte die Lieferadresse vollständig angeben.');
    lieferadresse = `${kontakt.strasse}, ${kontakt.plz} ${kontakt.ort}`;
  }

  const positionen = (Array.isArray(e.positionen) ? e.positionen : [])
    .map((p) => ({ chargeArtikelId: ganzeZahl(p && p.artikel_id), menge: Number(p && p.menge) }));
  if (!positionen.length || positionen.length > 30
      || positionen.some((p) => !Number.isInteger(p.menge) || p.menge < 1 || p.menge > 99)) {
    return fehler('ungueltig', 'Bitte Artikel und Mengen (1–99) angeben.');
  }
  if (new Set(positionen.map((p) => p.chargeArtikelId)).size !== positionen.length) {
    return fehler('ungueltig', 'Ein Artikel ist doppelt angegeben.');
  }
  const { results: inRunde } = await db.prepare('SELECT id FROM charge_artikel WHERE charge_id = ?').bind(runde.id).all();
  if (positionen.some((p) => !inRunde.some((a) => a.id === p.chargeArtikelId))) {
    return fehler('nicht_gefunden', 'Einen der Artikel gibt es in dieser Runde nicht (mehr).');
  }
  const zahlart = ZAHLARTEN[e.zahlart] ? e.zahlart : 'bar';
  const anmerkung = text(e.anmerkung, 1000) || null;

  // 3. Limits
  const proStunde = await db.prepare(
    `SELECT COUNT(*) AS n FROM extern_anfragen WHERE zugang_id = ? AND erstellt_am >= datetime('now', '-1 hour')`
  ).bind(zugang.id).first();
  if (proStunde.n >= LIMIT_PRO_STUNDE) return fehler('zu_viele');

  // 4. Kunde
  const kundeId = await externerKunde(db, zugang.id, externeId, kontakt);
  const offen = await db.prepare(
    `SELECT COUNT(*) AS n FROM bestellungen b JOIN extern_anfragen ea ON ea.bestellung_id = b.id
     WHERE ea.zugang_id = ? AND b.kunde_id = ? AND b.charge_id = ? AND b.status <> 'storniert'`
  ).bind(zugang.id, kundeId, runde.id).first();
  if (offen.n >= LIMIT_OFFEN_JE_KUNDE_RUNDE) {
    return fehler('zu_viele', `Für diese Runde sind schon ${LIMIT_OFFEN_JE_KUNDE_RUNDE} Bestellungen offen – bitte direkt beim Hof melden.`);
  }

  // 5. Anlegen – extern_anfragen in derselben Transaktion
  let bestellung;
  try {
    bestellung = await bestellungAnlegen(db, {
      chargeId: runde.id, kundeId, terminId: termin.id, quelle: 'web', zahlart, lieferadresse, anmerkung, positionen,
    }, {
      zusatz: (nummer) => [db.prepare(
        `INSERT INTO extern_anfragen (zugang_id, anfrage_id, bestellung_id, zustimmung)
         SELECT ?, ?, id, ? FROM bestellungen WHERE nummer = ?`
      ).bind(zugang.id, anfrageId, JSON.stringify(zustimmung), nummer)],
    });
  } catch (f) {
    if (f instanceof EingabeFehler) return fehler('ungueltig', f.message);
    // Gleichzeitige Wiederholung mit demselben Idempotency-Key: die andere
    // Anfrage hat gewonnen, diese Transaktion wurde komplett zurückgenommen
    if (/UNIQUE|PRIMARY KEY/i.test(String(f && f.message))) {
      return (await gespeicherteAntwort(context, anfrageId)) || fehler('in_bearbeitung');
    }
    throw f;
  }

  // 6. Antwort speichern, dann Mails (wie hofladen.html, Hof-Mail mit „über Bertha")
  const antwort = await bestellAntwort(db, bestellung.id);
  await db.prepare('UPDATE extern_anfragen SET antwort = ? WHERE zugang_id = ? AND anfrage_id = ?')
    .bind(JSON.stringify(antwort), zugang.id, anfrageId).run();

  const link = linkAdresse(request, await kundenLinkErstellen(db, kundeId));
  const { results: zeilen } = await db.prepare(
    `SELECT produkt_name, art, menge, einzelpreis_cent, betrag_cent, geschaetzt
     FROM v_positionen WHERE bestellung_id = ? ORDER BY id`
  ).bind(bestellung.id).all();
  await bestellMailsSenden(env, {
    kontakt, charge: runde, zahlart, bestellung, zeilen, link, anmerkung: anmerkung || '',
    terminText: terminText(termin), ueber: 'Bertha-Portal',
  });

  return externJson(antwort, 201);
}

/* ------------------------------------------------------------
   VERTEILER
   ------------------------------------------------------------ */
const AUFRUFE = {
  ping: { methode: 'GET', ausfuehren: ping },
  katalog: { methode: 'GET', recht: 'katalog', ausfuehren: katalog },
  angebot: { methode: 'GET', recht: 'angebot', ausfuehren: angebot },
  bestellungen: { methode: 'POST', recht: 'bestellen', ausfuehren: bestellen },
};

export async function onRequest(context) {
  const pfad = [].concat(context.params.pfad || []);
  const aufruf = pfad.length === 1 ? AUFRUFE[pfad[0]] : null;
  if (!aufruf) {
    context.data.fehlercode = 'nicht_gefunden';
    return externFehler('nicht_gefunden');
  }
  if (context.request.method !== aufruf.methode) {
    context.data.fehlercode = 'methode';
    return externJson({ ok: false, fehler: { code: 'methode', text: 'Diese Methode ist hier nicht erlaubt.' } }, 405,
      { Allow: aufruf.methode });
  }
  if (aufruf.recht) {
    const fehlt = rechtFehlt(context, aufruf.recht);
    if (fehlt) return fehlt;
  }
  return aufruf.ausfuehren(context);
}
