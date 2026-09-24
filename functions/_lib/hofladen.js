/* ============================================================
 * GEMEINSAME HELFER – Hofladen-Vorbestellung
 * ============================================================
 * Wird von den Functions unter functions/api/hofladen/ und
 * functions/api/verwaltung/ importiert. Diese Datei exportiert keine
 * onRequest-Handler und ist deshalb selbst keine Route.
 *
 * Datenbank: D1-Binding DB, Tabellen aus schema-hofladen.sql.
 * Beträge in Cent, Gewichte in Gramm.
 *
 * Inhalt:
 *   1. Antworten und Eingaben (json, escapeHtml, istGueltigeEmail)
 *   2. Beträge (positionBetrag, euro)
 *   3. Bestellnummern (naechsteBestellnummer)
 *      Preisvorschläge für neue Chargen (preisVorschlaege)
 *   4. Bestellung anlegen / nachrücken – Kontingent sicher prüfen
 *   5. Voranmeldungen (anlegen, in eine Charge übernehmen)
 * ============================================================ */

/* ------------------------------------------------------------
   1. ANTWORTEN UND EINGABEN
   ------------------------------------------------------------ */
export const json = (daten, status = 200) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

// Für E-Mails: Nutzereingaben gegen eingeschleustes HTML absichern.
export function escapeHtml(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function istGueltigeEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ------------------------------------------------------------
   2. BETRÄGE
   Gleiche Rechnung wie die Ansicht v_positionen in schema-hofladen.sql.
   ------------------------------------------------------------ */
export function positionBetrag({ art, preisCent, menge, gewichtG, richtVonG, richtBisG }) {
  if (art !== 'gewicht') return { cent: preisCent * menge, geschaetzt: false };
  if (gewichtG) return { cent: Math.round((preisCent * gewichtG) / 1000), geschaetzt: false };
  return {
    cent: Math.round((preisCent * menge * (richtVonG + richtBisG)) / 2000),
    geschaetzt: true,
  };
}

const euroFormat = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
export const euro = (cent) => euroFormat.format(cent / 100);

/* ------------------------------------------------------------
   3. BESTELLNUMMERN
   Fortlaufend je Jahr: 2026-001, 2026-002, … (ab 1000 vierstellig)
   Hochzählen und Lesen in einer Anweisung – keine doppelten Nummern.
   ------------------------------------------------------------ */
export async function naechsteBestellnummer(db, datum = new Date()) {
  const jahr = datum.getUTCFullYear();
  const zeile = await db.prepare(
    `INSERT INTO nummernkreis (jahr, letzte) VALUES (?, 1)
     ON CONFLICT (jahr) DO UPDATE SET letzte = letzte + 1
     RETURNING letzte`
  ).bind(jahr).first();
  return `${jahr}-${String(zeile.letzte).padStart(3, '0')}`;
}

/* Preisvorschläge für eine neue Charge: je aktivem Produkt Preis, Menge
   und Höchstmenge der letzten Charge, in der es vorkam. Produkte, die noch
   nie verkauft wurden, bekommen den Startpreis aus dem Katalog (oder null).
   Die Werte werden in der Verwaltung nur vorbelegt und können geändert
   werden – bestehende Bestellungen behalten ihren Preis. */
export async function preisVorschlaege(db) {
  const { results } = await db.prepare(
    `SELECT p.id AS produktId, p.name, p.art, p.kategorie,
            COALESCE(v.preis_cent, p.startpreis_cent) AS preisCent, v.kontingent, v.max_pro_bestellung AS maxProBestellung,
            v.aus_charge_titel AS ausCharge
     FROM produkte p
     LEFT JOIN v_letzter_preis v ON v.produkt_id = p.id
     WHERE p.aktiv = 1
     ORDER BY p.kategorie, p.reihenfolge, p.name`
  ).all();
  return results;
}

/* ------------------------------------------------------------
   4. BESTELLUNG ANLEGEN / NACHRÜCKEN
   Alles läuft in einem D1-batch() – das ist eine Transaktion, und D1
   führt Schreibzugriffe nacheinander aus. Die Bestellung wird zuerst als
   „vorgemerkt" eingetragen; ist danach bei einem ihrer Artikel mehr
   bestellt als vorhanden, wird genau diese Bestellung im selben Schritt
   auf die Warteliste gesetzt. So kann nichts doppelt verkauft werden.
   ------------------------------------------------------------ */

// Setzt die Bestellung mit dieser Nummer auf die Warteliste, falls einer
// ihrer Artikel überbucht ist.
const SQL_UEBERBUCHT_ZUR_WARTELISTE =
  `UPDATE bestellungen SET status = 'warteliste', geaendert_am = datetime('now')
   WHERE nummer = ?1 AND status = 'vorgemerkt' AND EXISTS (
     SELECT 1 FROM bestell_positionen p
     JOIN bestellungen b ON b.id = p.bestellung_id
     JOIN v_bestand v    ON v.charge_artikel_id = p.charge_artikel_id
     WHERE b.nummer = ?1 AND v.frei < 0
   )`;

export class EingabeFehler extends Error {}

/**
 * Legt eine Bestellung samt Positionen an.
 * @param {D1Database} db
 * @param {object} b
 *   chargeId, kundeId, terminId, quelle, zahlart, lieferadresse,
 *   liefergebuehrCent, anmerkung, interneNotiz,
 *   warteliste (true = bewusst auf die Warteliste),
 *   positionen: [{ chargeArtikelId, menge }]
 * @param {object} [optionen]
 *   hoechstmengeIgnorieren – true, wenn die Verwaltung bewusst mehr zulässt
 *   zusatz(nummer) – liefert weitere Anweisungen, die in derselben
 *                    Transaktion laufen (z. B. Voranmeldung als übernommen
 *                    markieren)
 * @returns {Promise<{ id: number, nummer: string, status: string }>}
 */
export async function bestellungAnlegen(db, b, optionen = {}) {
  const positionen = (b.positionen || []).filter((p) => p.menge > 0);
  if (!positionen.length) throw new EingabeFehler('Keine Artikel gewählt.');
  if (positionen.some((p) => !Number.isInteger(p.menge))) throw new EingabeFehler('Ungültige Menge.');

  // Artikel müssen zu dieser Charge gehören; Höchstmengen prüfen
  const { results: artikel } = await db.prepare(
    'SELECT id, max_pro_bestellung FROM charge_artikel WHERE charge_id = ?'
  ).bind(b.chargeId).all();
  const erlaubt = new Map(artikel.map((a) => [a.id, a.max_pro_bestellung]));
  for (const p of positionen) {
    if (!erlaubt.has(p.chargeArtikelId)) throw new EingabeFehler('Artikel gehört nicht zu dieser Charge.');
    const max = erlaubt.get(p.chargeArtikelId);
    if (max && p.menge > max && !optionen.hoechstmengeIgnorieren) throw new EingabeFehler(`Höchstens ${max} Stück pro Bestellung.`);
  }

  if (b.terminId != null) {
    const termin = await db.prepare('SELECT id FROM termine WHERE id = ? AND charge_id = ?')
      .bind(b.terminId, b.chargeId).first();
    if (!termin) throw new EingabeFehler('Termin gehört nicht zu dieser Charge.');
  }

  const nummer = await naechsteBestellnummer(db);

  const anweisungen = [
    db.prepare(
      `INSERT INTO bestellungen
         (nummer, charge_id, kunde_id, quelle, status, termin_id, lieferadresse,
          zahlart, liefergebuehr_cent, anmerkung, interne_notiz)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      nummer, b.chargeId, b.kundeId, b.quelle || 'web',
      b.warteliste ? 'warteliste' : 'vorgemerkt',
      b.terminId ?? null, b.lieferadresse || null, b.zahlart || 'bar',
      b.liefergebuehrCent || 0, b.anmerkung || null, b.interneNotiz || null
    ),
    // Einzelpreis zum Bestellzeitpunkt aus der Charge übernehmen
    ...positionen.map((p) => db.prepare(
      `INSERT INTO bestell_positionen (bestellung_id, charge_artikel_id, menge, einzelpreis_cent)
       SELECT b.id, ca.id, ?, ca.preis_cent
       FROM bestellungen b JOIN charge_artikel ca ON ca.charge_id = b.charge_id
       WHERE b.nummer = ? AND ca.id = ?`
    ).bind(p.menge, nummer, p.chargeArtikelId)),
    db.prepare(SQL_UEBERBUCHT_ZUR_WARTELISTE).bind(nummer),
    ...(optionen.zusatz ? optionen.zusatz(nummer) : []),
    db.prepare('SELECT id, nummer, status FROM bestellungen WHERE nummer = ?').bind(nummer),
  ];

  const ergebnisse = await db.batch(anweisungen);
  return ergebnisse[ergebnisse.length - 1].results[0];
}

/**
 * Holt eine Bestellung von der Warteliste (oder stellt eine stornierte
 * wieder her). Reicht die freie Menge nicht, bleibt sie auf der Warteliste.
 * @returns {Promise<{ id: number, nummer: string, status: string }>}
 */
export async function bestellungNachruecken(db, bestellungId) {
  const b = await db.prepare('SELECT nummer FROM bestellungen WHERE id = ?').bind(bestellungId).first();
  if (!b) throw new EingabeFehler('Bestellung nicht gefunden.');
  const ergebnisse = await db.batch([
    db.prepare(
      `UPDATE bestellungen SET status = 'vorgemerkt', geaendert_am = datetime('now')
       WHERE nummer = ? AND status IN ('warteliste', 'storniert')`
    ).bind(b.nummer),
    db.prepare(SQL_UEBERBUCHT_ZUR_WARTELISTE).bind(b.nummer),
    db.prepare('SELECT id, nummer, status FROM bestellungen WHERE nummer = ?').bind(b.nummer),
  ]);
  return ergebnisse[ergebnisse.length - 1].results[0];
}

/* ------------------------------------------------------------
   5. VORANMELDUNGEN
   Unverbindlich, ohne Preis und Termin. Zählen nicht vom Kontingent ab,
   bis sie in eine Charge übernommen werden.
   ------------------------------------------------------------ */
export const ZEITRAEUME = {
  naechste: 'nächste Charge',
  fruehjahr: 'Frühjahr',
  sommer: 'Sommer',
  herbst: 'Herbst',
  martini: 'Martini',
  weihnachten: 'Weihnachten',
};

export function zeitraumText(zeitraum, jahr) {
  return zeitraum === 'naechste' ? ZEITRAEUME.naechste : `${ZEITRAEUME[zeitraum]} ${jahr}`;
}

/**
 * Legt eine Voranmeldung an (Website oder Verwaltung).
 * @param {object} v  kundeId, produktId, menge, zeitraum, jahr, quelle, notiz
 * @returns {Promise<number>} id der Voranmeldung
 */
export async function voranmeldungAnlegen(db, v) {
  if (!ZEITRAEUME[v.zeitraum]) throw new EingabeFehler('Ungültiger Zeitraum.');
  const menge = Number(v.menge);
  if (!Number.isInteger(menge) || menge < 1 || menge > 999) throw new EingabeFehler('Ungültige Menge.');
  let jahr = null;
  if (v.zeitraum !== 'naechste') {
    jahr = Number(v.jahr);
    const diesesJahr = new Date().getUTCFullYear();
    if (!Number.isInteger(jahr) || jahr < diesesJahr || jahr > diesesJahr + 2) {
      throw new EingabeFehler('Ungültiges Jahr.');
    }
  }
  const produkt = await db.prepare('SELECT id FROM produkte WHERE id = ? AND aktiv = 1')
    .bind(v.produktId).first();
  if (!produkt) throw new EingabeFehler('Produkt nicht verfügbar.');

  const zeile = await db.prepare(
    `INSERT INTO voranmeldungen (kunde_id, produkt_id, menge, zeitraum, jahr, quelle, notiz)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(v.kundeId, v.produktId, menge, v.zeitraum, jahr, v.quelle || 'web', v.notiz || null).first();
  return zeile.id;
}

/**
 * Übernimmt ausgewählte offene Voranmeldungen in eine Charge.
 * Je Kunde entsteht eine Bestellung (mehrere Produkte werden zusammengefasst),
 * in der Reihenfolge der Anmeldung – wer zuerst kam, wird zuerst vorgemerkt;
 * reicht die Menge nicht mehr, landet die Bestellung auf der Warteliste.
 * Termin und Zahlart sind noch offen und werden beim Bestätigen nachgetragen.
 * Voranmeldungen für Produkte, die nicht in der Charge sind, bleiben offen.
 *
 * @returns {Promise<{ bestellungen: Array<{kundeId, id, nummer, status}>, uebersprungen: number[] }>}
 */
export async function voranmeldungenUebernehmen(db, chargeId, voranmeldungIds) {
  const ids = [...new Set(voranmeldungIds.map(Number))].filter(Number.isInteger);
  if (!ids.length) throw new EingabeFehler('Keine Voranmeldungen gewählt.');

  const { results } = await db.prepare(
    `SELECT v.id, v.kunde_id, v.menge, v.quelle, ca.id AS charge_artikel_id
     FROM voranmeldungen v
     JOIN charge_artikel ca ON ca.produkt_id = v.produkt_id AND ca.charge_id = ?
     WHERE v.status = 'offen' AND v.id IN (${ids.map(() => '?').join(', ')})
     ORDER BY v.erstellt_am, v.id`
  ).bind(chargeId, ...ids).all();

  // Nach Kunde gruppieren, Reihenfolge = früheste Anmeldung des Kunden
  const jeKunde = new Map();
  for (const r of results) {
    if (!jeKunde.has(r.kunde_id)) jeKunde.set(r.kunde_id, { quelle: r.quelle, ids: [], mengen: new Map() });
    const k = jeKunde.get(r.kunde_id);
    k.ids.push(r.id);
    k.mengen.set(r.charge_artikel_id, (k.mengen.get(r.charge_artikel_id) || 0) + r.menge);
  }

  const bestellungen = [];
  for (const [kundeId, k] of jeKunde) {
    const erg = await bestellungAnlegen(db, {
      chargeId,
      kundeId,
      quelle: k.quelle,
      interneNotiz: 'aus Voranmeldung – Termin und Zahlart bestätigen',
      positionen: [...k.mengen].map(([chargeArtikelId, menge]) => ({ chargeArtikelId, menge })),
    }, {
      hoechstmengeIgnorieren: true,
      zusatz: (nummer) => [db.prepare(
        `UPDATE voranmeldungen
         SET status = 'uebernommen', geaendert_am = datetime('now'),
             bestellung_id = (SELECT id FROM bestellungen WHERE nummer = ?)
         WHERE status = 'offen' AND id IN (${k.ids.map(() => '?').join(', ')})`
      ).bind(nummer, ...k.ids)],
    });
    bestellungen.push({ kundeId, ...erg });
  }

  const uebernommen = new Set(results.map((r) => r.id));
  return { bestellungen, uebersprungen: ids.filter((id) => !uebernommen.has(id)) };
}
