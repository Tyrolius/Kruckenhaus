/* ============================================================
 * GEMEINSAME HELFER – Schnittstelle für Bertha (/api/extern/v1/…)
 * ============================================================
 * Plan: docs/SCHNITTSTELLE-BERTHA.md. Wird von functions/api/extern/ und
 * von der Verwaltung (Bereich „Verbindung zu Bertha") importiert. Diese
 * Datei exportiert keine onRequest-Handler und ist selbst keine Route.
 *
 * Datenbank: D1-Binding DB, Tabellen schnittstellen_zugaenge,
 * schnittstellen_protokoll, einstellungen (schema-hofladen.sql).
 *
 * Inhalt:
 *   1. Rechte und Antworten (externJson, externFehler)
 *   2. Zugänge (anlegen, sperren, Schlüssel prüfen)
 *   3. Pausieren (Not-Aus)
 *   4. Protokoll (ohne personenbezogene Daten, 90 Tage)
 * ============================================================ */

import { sha256Hex, zufallsSchluessel } from './hofladen.js';

/* ------------------------------------------------------------
   1. RECHTE UND ANTWORTEN
   Keine CORS-Header: Browser fremder Seiten dürfen die Schnittstelle
   nicht aufrufen – nur der Bertha-Server soll sie nutzen.
   ------------------------------------------------------------ */
export const RECHTE = {
  katalog: 'Dauerartikel lesen',
  angebot: 'Fleischrunden lesen',
  bestellen: 'Fleisch bestellen',
  status: 'Bestellstand lesen',
};

export const EXTERN_KOPF = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

export const externJson = (daten, status = 200, kopf = {}) =>
  new Response(JSON.stringify(daten), { status, headers: { ...EXTERN_KOPF, ...kopf } });

// Fehler immer im selben Format: fester code für Bertha, ein Satz für Kunden
export const FEHLER = {
  ungueltig: [400, 'Die Anfrage ist unvollständig oder fehlerhaft.'],
  nicht_angemeldet: [401, 'Nicht angemeldet.'],
  keine_berechtigung: [403, 'Für diesen Aufruf fehlt die Berechtigung.'],
  nicht_gefunden: [404, 'Nicht gefunden.'],
  methode: [405, 'Diese Methode ist hier nicht erlaubt.'],
  bestellschluss: [409, 'Der Bestellschluss für diese Runde ist vorbei.'],
  nicht_im_portal: [409, 'Diese Runde ist im Portal nicht bestellbar.'],
  ausserhalb_liefergebiet: [409, 'Diese Postleitzahl liegt außerhalb unseres Liefergebiets – bitte Abholung wählen.'],
  in_bearbeitung: [409, 'Diese Bestellung wird gerade schon bearbeitet – bitte gleich mit demselben Idempotency-Key wiederholen.'],
  zu_gross: [413, 'Die Anfrage ist zu groß.'],
  zu_viele: [429, 'Zu viele Anfragen – bitte später erneut versuchen.'],
  intern: [500, 'Interner Fehler – bitte später erneut versuchen.'],
  pausiert: [503, 'Der Hofladen ist gerade nicht erreichbar – bitte später nochmal oder anrufen.'],
};

export function externFehler(code, text) {
  const [status, standard] = FEHLER[code] || FEHLER.intern;
  return externJson({ ok: false, fehler: { code, text: text || standard } }, status);
}

/* ------------------------------------------------------------
   2. ZUGÄNGE
   Schlüssel: Präfix + 32 Byte Zufall (base64url, 43 Zeichen). Er wird nur
   beim Anlegen einmal zurückgegeben; gespeichert wird nur die SHA-256-
   Prüfsumme. Präfix kh_live_ auf der echten Adresse, kh_test_ auf den
   Vorschau-Adressen (Test-Datenbank) – so ist sofort sichtbar, wohin ein
   Schlüssel gehört.
   ------------------------------------------------------------ */
const SCHLUESSEL_MUSTER = /^kh_(live|test)_[A-Za-z0-9_-]{43}$/;

export function rechteLesen(text) {
  return String(text || '').split(',').map((r) => r.trim()).filter((r) => RECHTE[r]);
}

/**
 * Legt einen Zugang an.
 * @returns {Promise<{ id: number, schluessel: string }>} Schlüssel nur dieses eine Mal
 */
export async function zugangAnlegen(db, { name, rechte, test = false }) {
  const schluessel = `kh_${test ? 'test' : 'live'}_${zufallsSchluessel()}`;
  const zeile = await db.prepare(
    'INSERT INTO schnittstellen_zugaenge (name, schluessel_hash, rechte) VALUES (?, ?, ?) RETURNING id'
  ).bind(name, await sha256Hex(schluessel), rechte.join(',')).first();
  return { id: zeile.id, schluessel };
}

/** Sperrt einen Zugang sofort. Liefert false, wenn es ihn nicht (mehr offen) gibt. */
export async function zugangSperren(db, id) {
  const r = await db.prepare(
    `UPDATE schnittstellen_zugaenge SET gesperrt_am = datetime('now') WHERE id = ? AND gesperrt_am IS NULL`
  ).bind(id).run();
  return Boolean(r.meta.changes);
}

/**
 * Prüft den Header „Authorization: Bearer …". Liefert den Zugang
 * ({ id, name, rechte: [] }) oder null – ohne zu verraten, was falsch war.
 */
export async function zugangAusAnfrage(db, request) {
  const treffer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  if (!treffer || !SCHLUESSEL_MUSTER.test(treffer[1])) return null;
  const hash = await sha256Hex(treffer[1]);
  const zugang = await db.prepare(
    'SELECT id, name, rechte FROM schnittstellen_zugaenge WHERE schluessel_hash = ? AND gesperrt_am IS NULL'
  ).bind(hash).first();
  if (!zugang) return null;
  await db.prepare(`UPDATE schnittstellen_zugaenge SET zuletzt_genutzt = datetime('now') WHERE id = ?`)
    .bind(zugang.id).run();
  return { id: zugang.id, name: zugang.name, rechte: rechteLesen(zugang.rechte) };
}

/* ------------------------------------------------------------
   3. PAUSIEREN (Not-Aus in der Verwaltung)
   Alle Aufrufe antworten dann mit 503, die Website selbst läuft weiter.
   ------------------------------------------------------------ */
export async function istPausiert(db) {
  const zeile = await db.prepare(`SELECT wert FROM einstellungen WHERE name = 'schnittstelle_pausiert'`).first();
  return Boolean(zeile && zeile.wert === '1');
}

export async function pausiertSetzen(db, pausiert) {
  await db.prepare(
    `INSERT INTO einstellungen (name, wert) VALUES ('schnittstelle_pausiert', ?)
     ON CONFLICT (name) DO UPDATE SET wert = excluded.wert`
  ).bind(pausiert ? '1' : '0').run();
}

/* ------------------------------------------------------------
   4. PROTOKOLL
   Nur wann, welcher Zugang, welcher Aufruf, Ergebnis, Dauer – keine
   Namen, E-Mails, Adressen oder Bestellinhalte. Ältere Einträge als
   90 Tage werden beim Schreiben gelöscht.
   ------------------------------------------------------------ */
export async function protokollieren(db, { zugangId = null, aufruf, httpStatus, fehlercode = null, dauerMs = null }) {
  await db.batch([
    db.prepare(
      `INSERT INTO schnittstellen_protokoll (zugang_id, aufruf, http_status, fehlercode, dauer_ms)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(zugangId, String(aufruf).slice(0, 80), httpStatus, fehlercode, dauerMs),
    db.prepare(`DELETE FROM schnittstellen_protokoll WHERE zeitpunkt < datetime('now', '-90 days')`),
  ]);
}
