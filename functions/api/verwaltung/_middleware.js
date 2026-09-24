/* ============================================================
 * CLOUDFLARE PAGES FUNCTION – Zugangsschutz der Verwaltung
 * ============================================================
 * Läuft vor jeder Anfrage an /api/verwaltung/… und lässt nur angemeldete,
 * freigegebene Nutzer durch (Prüfung in functions/_lib/zugang.js).
 * Die E-Mail-Adresse steht danach in context.data.nutzer.
 * ============================================================ */

import { json } from '../../_lib/hofladen.js';
import { zugangPruefen } from '../../_lib/zugang.js';

export async function onRequest(context) {
  const ergebnis = await zugangPruefen(context.request, context.env);
  if (!ergebnis.ok) return json({ ok: false, error: ergebnis.fehler }, ergebnis.status);
  context.data.nutzer = ergebnis.email;
  return context.next();
}
