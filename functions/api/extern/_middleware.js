/* ============================================================
 * CLOUDFLARE PAGES FUNCTION – Zugangsprüfung der Schnittstelle für Bertha
 * ============================================================
 * Läuft vor jeder Anfrage an /api/extern/… (Plan: docs/SCHNITTSTELLE-BERTHA.md).
 *
 * Ablauf:
 *   1. Schlüssel aus „Authorization: Bearer kh_live_…" prüfen
 *      (nur SHA-256-Prüfsumme in D1, gesperrte Zugänge zählen nicht).
 *      Fehlt oder passt er nicht: einheitlich 401, ohne Hinweis, was falsch war.
 *   2. Schnittstelle in der Verwaltung pausiert? Dann 503.
 *   3. Zugang steht in context.data.zugang; Rechte prüft der jeweilige Aufruf.
 *   4. Jede Anfrage kommt ins Protokoll (ohne personenbezogene Daten).
 *
 * Bewusst KEIN „graceful degradation": ohne Datenbank oder Tabellen
 * antwortet die Schnittstelle mit einem Fehler, nie ohne Prüfung.
 * Keine CORS-Header (nur Server zu Server).
 *
 * Binding: DB (D1). Cloudflare Access darf /api/extern/* NICHT abdecken.
 * ============================================================ */

import { externFehler, zugangAusAnfrage, istPausiert, protokollieren } from '../../_lib/extern.js';

// Aufruf fürs Protokoll: Methode und Pfad ohne Abfrageteil, gekürzt
function aufrufText(request) {
  const pfad = new URL(request.url).pathname.replace(/^\/api\/extern/, '') || '/';
  return `${request.method} ${pfad.replace(/[^\w/.-]/g, '').slice(0, 60)}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const start = Date.now();
  if (!env.DB) return externFehler('intern');
  const db = env.DB;

  let zugang = null;
  let antwort;
  try {
    zugang = await zugangAusAnfrage(db, request);
    if (!zugang) {
      context.data.fehlercode = 'nicht_angemeldet';
      antwort = externFehler('nicht_angemeldet');
    } else if (await istPausiert(db)) {
      context.data.fehlercode = 'pausiert';
      antwort = externFehler('pausiert');
    } else {
      context.data.zugang = zugang;
      antwort = await context.next();
    }
  } catch (fehler) {
    console.error('Schnittstelle – Fehler:', fehler);
    context.data.fehlercode = 'intern';
    antwort = externFehler('intern');
  }

  try {
    await protokollieren(db, {
      zugangId: zugang ? zugang.id : null,
      aufruf: aufrufText(request),
      httpStatus: antwort.status,
      fehlercode: context.data.fehlercode || null,
      dauerMs: Date.now() - start,
    });
  } catch (fehler) {
    // Protokoll darf die Antwort nie verhindern
    console.error('Schnittstelle – Protokoll fehlgeschlagen:', fehler);
  }
  return antwort;
}
