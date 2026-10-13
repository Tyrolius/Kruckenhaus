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
 * Später (Phase W4): GET /angebot, POST /bestellungen.
 *
 * Fehlerformat: { ok: false, fehler: { code, text } }
 * Versionierung: /v1/ bleibt stabil, neue Felder kommen nur hinzu.
 *
 * Binding: DB (D1)
 * ============================================================ */

import { externJson, externFehler } from '../../../_lib/extern.js';
import { sha256Hex } from '../../../_lib/hofladen.js';

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
   VERTEILER
   ------------------------------------------------------------ */
const AUFRUFE = {
  ping: { methode: 'GET', ausfuehren: ping },
  katalog: { methode: 'GET', recht: 'katalog', ausfuehren: katalog },
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
