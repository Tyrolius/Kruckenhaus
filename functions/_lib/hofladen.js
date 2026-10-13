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
 *      Preisvorschläge für neue Bestellrunden (preisVorschlaege)
 *   4. Bestellung anlegen / nachrücken – Kontingent sicher prüfen
 *   4a. Dauersortiment (ständige Runde für Dauerartikel)
 *   5. Voranmeldungen (anlegen, in eine Bestellrunde übernehmen)
 *   6. Persönliche Links „Meine Bestellungen" (kundenLinkErstellen, kundeAusLink)
 *   7. E-Mail über Resend (mailSenden)
 *   8. Bankverbindung aus den Cloudflare-Einstellungen (bankAusEnv)
 * ============================================================ */

import { textAusHtml } from './mail.js';

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

/* Preisvorschläge für eine neue Bestellrunde: je aktivem Produkt Preis, Menge
   und Höchstmenge der letzten Bestellrunde, in der es vorkam. Produkte, die noch
   nie in einer Bestellrunde waren, bekommen den Preis des Dauersortiments
   bzw. den Startpreis aus dem Katalog (oder null).
   Die Werte werden in der Verwaltung nur vorbelegt und können geändert
   werden – bestehende Bestellungen behalten ihren Preis. */
export async function preisVorschlaege(db) {
  const { results } = await db.prepare(
    `SELECT p.id AS produktId, p.name, p.art, p.kategorie,
            COALESCE(v.preis_cent, p.dauerpreis_cent, p.startpreis_cent) AS preisCent, v.kontingent, v.max_pro_bestellung AS maxProBestellung,
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
// ihrer Artikel überbucht ist. Das Dauersortiment hat keine Mengen und
// wird nie überbucht.
const SQL_UEBERBUCHT_ZUR_WARTELISTE =
  `UPDATE bestellungen SET status = 'warteliste', geaendert_am = datetime('now')
   WHERE nummer = ?1 AND status = 'vorgemerkt'
     AND charge_id NOT IN (SELECT id FROM chargen WHERE art = 'dauer') AND EXISTS (
     SELECT 1 FROM bestell_positionen p
     JOIN bestellungen b ON b.id = p.bestellung_id
     JOIN v_bestand v    ON v.charge_artikel_id = p.charge_artikel_id
     WHERE b.nummer = ?1 AND v.frei < 0
   )`;

// Bestellung mit dieser Nummer gilt in der Verwaltung nicht mehr als „neu"
// (für alles, was die Verwaltung selbst anlegt).
export const SQL_ALS_GESEHEN =
  `INSERT OR IGNORE INTO bestellung_gesehen (bestellung_id)
   SELECT id FROM bestellungen WHERE nummer = ?`;

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
 *   ausverkauftZulassen – true, wenn die Verwaltung bewusst einen als
 *                    ausverkauft markierten Dauerartikel einträgt
 *   zusatz(nummer) – liefert weitere Anweisungen, die in derselben
 *                    Transaktion laufen (z. B. Voranmeldung als übernommen
 *                    markieren)
 * @returns {Promise<{ id: number, nummer: string, status: string }>}
 */
export async function bestellungAnlegen(db, b, optionen = {}) {
  const positionen = (b.positionen || []).filter((p) => p.menge > 0);
  if (!positionen.length) throw new EingabeFehler('Keine Artikel gewählt.');
  if (positionen.some((p) => !Number.isInteger(p.menge))) throw new EingabeFehler('Ungültige Menge.');

  // Artikel müssen zu dieser Bestellrunde gehören; Höchstmengen prüfen
  const { results: artikel } = await db.prepare(
    `SELECT ca.id, ca.max_pro_bestellung, c.art AS charge_art, p.name, p.aktiv, p.verkaufsart, p.verfuegbar
     FROM charge_artikel ca JOIN chargen c ON c.id = ca.charge_id JOIN produkte p ON p.id = ca.produkt_id
     WHERE ca.charge_id = ?`
  ).bind(b.chargeId).all();
  const erlaubt = new Map(artikel.map((a) => [a.id, a]));
  for (const p of positionen) {
    if (!erlaubt.has(p.chargeArtikelId)) throw new EingabeFehler('Artikel gehört nicht zu dieser Bestellrunde.');
    const a = erlaubt.get(p.chargeArtikelId);
    const max = a.max_pro_bestellung;
    if (max && p.menge > max && !optionen.hoechstmengeIgnorieren) throw new EingabeFehler(`Höchstens ${max} Stück pro Bestellung.`);
    // Dauersortiment: statt Mengenprüfung nur „verfügbar" (eingeblendet,
    // weiterhin Dauerartikel, nicht ausverkauft)
    if (a.charge_art === 'dauer' && !optionen.ausverkauftZulassen
        && !(a.aktiv && a.verkaufsart === 'dauer' && a.verfuegbar)) {
      throw new EingabeFehler(`„${a.name}" ist gerade ausverkauft.`);
    }
  }

  if (b.terminId != null) {
    const termin = await db.prepare('SELECT id FROM termine WHERE id = ? AND charge_id = ?')
      .bind(b.terminId, b.chargeId).first();
    if (!termin) throw new EingabeFehler('Termin gehört nicht zu dieser Bestellrunde.');
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
    // Einzelpreis zum Bestellzeitpunkt aus der Bestellrunde übernehmen
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
   4a. DAUERSORTIMENT
   Dauerartikel (Nudeln, Seife …) hängen nicht an einer Bestellrunde mit
   Menge und Bestellschluss. Damit Bestellliste, Übergabe, Zahlungen,
   Export und „Meine Bestellungen" trotzdem unverändert funktionieren,
   gibt es genau eine ständige Runde mit art = 'dauer'. Ihre Artikel werden
   hier aus den Produkten gebildet:
     – je Produkt mit verkaufsart 'dauer' ein Artikel, Preis = dauerpreis_cent
     – Preisänderungen gelten nur für neue Bestellungen (Einzelpreis je Position)
     – Artikel werden nie gelöscht (alte Bestellungen verweisen darauf);
       was nicht mehr Dauerartikel ist, filtert die Bestellprüfung heraus
   Die Menge (kontingent) ist bedeutungslos und bleibt 0.
   ------------------------------------------------------------ */
export const DAUERSORTIMENT_TITEL = 'Dauersortiment';
export const DAUER_BESTELLSCHLUSS = '9999-12-31';

/** Liefert die ID der ständigen Runde (oder null, solange es keine gibt). */
export async function dauersortimentId(db) {
  const zeile = await db.prepare(`SELECT id FROM chargen WHERE art = 'dauer'`).first();
  return zeile ? zeile.id : null;
}

/**
 * Gleicht die ständige Runde mit dem Sortiment ab. Legt sie an, sobald es
 * den ersten Dauerartikel mit Preis gibt. Mehrfach aufrufbar.
 * @returns {Promise<number|null>} ID der Runde
 */
export async function dauersortimentAbgleichen(db) {
  const { results: produkte } = await db.prepare(
    `SELECT id, dauerpreis_cent FROM produkte
     WHERE verkaufsart = 'dauer' AND dauerpreis_cent IS NOT NULL ORDER BY id`
  ).all();
  let cid = await dauersortimentId(db);
  if (!cid && !produkte.length) return null;
  if (!cid) {
    // INSERT OR IGNORE: der eindeutige Index idx_chargen_dauer verhindert
    // eine zweite Runde, falls zwei Speichervorgänge gleichzeitig kommen
    await db.prepare(
      `INSERT OR IGNORE INTO chargen (titel, beschreibung, status, bestellschluss, art)
       VALUES (?, 'Immer erhältlich – ohne Bestellschluss.', 'offen', ?, 'dauer')`
    ).bind(DAUERSORTIMENT_TITEL, DAUER_BESTELLSCHLUSS).run();
    cid = await dauersortimentId(db);
  }
  if (!produkte.length) return cid;
  await db.batch([
    // immer offen, nie archiviert
    db.prepare(`UPDATE chargen SET status = 'offen', bestellschluss = ? WHERE id = ?`).bind(DAUER_BESTELLSCHLUSS, cid),
    ...produkte.map((p) => db.prepare(
      `INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent)
       VALUES (?, ?, ?, 0)
       ON CONFLICT (charge_id, produkt_id) DO UPDATE SET preis_cent = excluded.preis_cent`
    ).bind(cid, p.id, p.dauerpreis_cent)),
  ]);
  return cid;
}

/* ------------------------------------------------------------
   5. VORANMELDUNGEN
   Unverbindlich, ohne Preis und Termin. Zählen nicht vom Kontingent ab,
   bis sie in eine Bestellrunde übernommen werden.
   ------------------------------------------------------------ */
export const ZEITRAEUME = {
  naechste: 'nächste Bestellrunde',
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
 * Übernimmt ausgewählte offene Voranmeldungen in eine Bestellrunde.
 * Je Kunde entsteht eine Bestellung (mehrere Produkte werden zusammengefasst),
 * in der Reihenfolge der Anmeldung – wer zuerst kam, wird zuerst vorgemerkt;
 * reicht die Menge nicht mehr, landet die Bestellung auf der Warteliste.
 * Termin und Zahlart sind noch offen und werden beim Bestätigen nachgetragen.
 * Voranmeldungen für Produkte, die nicht in der Bestellrunde sind, bleiben offen.
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
      ).bind(nummer, ...k.ids), db.prepare(SQL_ALS_GESEHEN).bind(nummer)],
    });
    bestellungen.push({ kundeId, ...erg });
  }

  const uebernommen = new Set(results.map((r) => r.id));
  return { bestellungen, uebersprungen: ids.filter((id) => !uebernommen.has(id)) };
}

/* ------------------------------------------------------------
   6. PERSÖNLICHE LINKS „MEINE BESTELLUNGEN"
   Zufälliger Schlüssel (256 Bit) im Link, in der Datenbank nur dessen
   SHA-256-Prüfsumme. Der Schlüssel steht im Link hinter „#" und wird so
   nie in Server-Protokollen oder als Referrer übertragen.
   ------------------------------------------------------------ */
async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function zufallsSchluessel() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Erzeugt einen neuen Link-Schlüssel für einen Kunden (ältere bleiben gültig). */
export async function kundenLinkErstellen(db, kundeId) {
  const schluessel = zufallsSchluessel();
  await db.prepare('INSERT INTO kunden_links (schluessel_hash, kunde_id) VALUES (?, ?)')
    .bind(await sha256Hex(schluessel), kundeId).run();
  return schluessel;
}

/** Liefert die Kunden-ID zu einem Link-Schlüssel oder null (unbekannt/gesperrt). */
export async function kundeAusLink(db, schluessel) {
  if (typeof schluessel !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(schluessel)) return null;
  const hash = await sha256Hex(schluessel);
  const zeile = await db.prepare(
    'SELECT kunde_id FROM kunden_links WHERE schluessel_hash = ? AND gesperrt_am IS NULL'
  ).bind(hash).first();
  if (!zeile) return null;
  await db.prepare("UPDATE kunden_links SET zuletzt_genutzt = datetime('now') WHERE schluessel_hash = ?")
    .bind(hash).run();
  return zeile.kunde_id;
}

/* ------------------------------------------------------------
   7. E-MAIL (Resend)
   Fehlt RESEND_API_KEY, wird nichts verschickt, aber auch kein Fehler
   ausgelöst – gespeichert ist die Bestellung trotzdem.
   html kommt fertig aus mailHtml() (functions/_lib/mail.js); die
   Nur-Text-Fassung wird daraus abgeleitet.
   ------------------------------------------------------------ */
export async function mailSenden(env, { an, betreff, html, antwortAn }) {
  if (!env.RESEND_API_KEY) return { gesendet: false, grund: 'kein-api-key' };
  try {
    const antwort = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.CONTACT_FROM || 'Bergbauernhof Kruckenhaus <website@kruckenhaus.at>',
        to: an,
        subject: betreff,
        html,
        text: textAusHtml(html),
        ...(antwortAn ? { reply_to: antwortAn } : {}),
      }),
    });
    if (!antwort.ok) {
      // Abgelehnte Mails sichtbar machen (Real-time Logs der Functions).
      // Nur Statuscode und Resend-Fehlertext, keine Kundendaten.
      const fehler = await antwort.json().catch(() => ({}));
      console.error(
        `Resend hat die E-Mail abgelehnt: HTTP ${antwort.status}` +
          (fehler.name ? ` (${fehler.name})` : '') +
          (fehler.message ? ` – ${String(fehler.message).slice(0, 200)}` : '')
      );
    }
    return { gesendet: antwort.ok, grund: antwort.ok ? null : `resend-http-${antwort.status}` };
  } catch (fehler) {
    console.error('E-Mail-Versand fehlgeschlagen:', fehler);
    return { gesendet: false, grund: 'netzwerk' };
  }
}

/* ------------------------------------------------------------
   8. BANKVERBINDUNG
   Bewusst nicht im Code, sondern als Cloudflare-Secrets (BANK_INHABER,
   BANK_IBAN, BANK_BIC, BANK_NAME). Fehlt BANK_IBAN, gibt es keine
   Überweisungsdaten und keinen QR-Code – sonst läuft alles weiter.
   ------------------------------------------------------------ */
export function bankAusEnv(env) {
  if (!env.BANK_IBAN) return null;
  return {
    inhaber: env.BANK_INHABER || '',
    iban: String(env.BANK_IBAN).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim(),
    bic: env.BANK_BIC || '',
    bank: env.BANK_NAME || '',
  };
}
