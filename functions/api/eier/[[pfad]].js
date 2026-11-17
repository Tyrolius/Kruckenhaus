/* ============================================================
 * CLOUDFLARE PAGES FUNCTION – Freilandeier (öffentlich)
 * ============================================================
 * Erreichbar unter /api/eier/… – genutzt von freilandeier.html
 * (js/freilandeier.js).
 *
 *   POST /api/eier/anmeldung    Formular „Kunde werden" (JSON)
 *   GET  /api/eier/neuigkeiten  „Aktuelles vom Stall" (nur sichtbare Einträge)
 *
 * Ablauf einer Anmeldung (Muster: functions/api/kontakt.js):
 *   1. Spam-Schutz: Honeypot-Feld „bot-field" – gefüllt = still „ok".
 *   2. Felder prüfen (anmeldungPruefen in functions/_lib/eier.js).
 *   3. In D1 speichern (Tabelle eier_anmeldungen, Status „neu").
 *      Bewusst OHNE IP-Adresse und Browserkennung.
 *   4. Benachrichtigung an den Hof (CONTACT_TO), Antwort geht an den Interessenten.
 *   5. Bestätigung an den Interessenten – ohne frei eingegebene Texte.
 *
 * Bindings / Variablen:
 *   D1-Binding DB (Tabellen aus schema-eier.sql)
 *   Secret RESEND_API_KEY – fehlt er, wird trotzdem gespeichert, es geht
 *     nur keine Mail raus (kein harter Fehler fürs Formular).
 *   Optional CONTACT_TO (Standard info@kruckenhaus.at), CONTACT_FROM,
 *     CONTACT_BESTAETIGUNG = "aus" schaltet die Bestätigung ab.
 * Speichern und Mail scheitern beide → Fehler 500, damit niemand glaubt,
 * die Anmeldung sei angekommen.
 * ============================================================ */

import { json, EingabeFehler, mailSenden } from '../../_lib/hofladen.js';
import { anmeldungPruefen, anmeldungSpeichern, hofMail, bestaetigungMail, neuigkeitenOeffentlich } from '../../_lib/eier.js';

async function anmelden(request, env) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return json({ ok: false, error: 'Nur JSON-Anfragen.' }, 415);
  }
  const eingabe = await request.json().catch(() => null);
  if (!eingabe || typeof eingabe !== 'object') return json({ ok: false, error: 'Ungültige Anfrage.' }, 400);

  // 1. Honeypot – Bots füllen dieses versteckte Feld aus
  if (eingabe['bot-field']) return json({ ok: true });

  // 2. Prüfen
  let d;
  try {
    d = anmeldungPruefen(eingabe);
  } catch (fehler) {
    if (fehler instanceof EingabeFehler) return json({ ok: false, error: fehler.message }, 400);
    throw fehler;
  }

  // 3. Speichern
  let gespeichert = false;
  if (env.DB) {
    try {
      gespeichert = Boolean(await anmeldungSpeichern(env.DB, d));
    } catch (fehler) {
      // Speichern darf die Mail nicht blockieren – nur protokollieren (ohne Kundendaten)
      console.error('Eier-Anmeldung: D1-Insert fehlgeschlagen:', String(fehler && fehler.message));
    }
  }

  // 4. Mail an den Hof
  const hof = hofMail(d);
  const anHof = await mailSenden(env, {
    an: env.CONTACT_TO || 'info@kruckenhaus.at', betreff: hof.betreff, html: hof.html, antwortAn: d.email,
  });
  if (!gespeichert && !anHof.gesendet) {
    return json({ ok: false, error: 'Die Anmeldung konnte gerade nicht gespeichert werden.' }, 500);
  }

  // 5. Bestätigung an den Interessenten – Fehler hier nie ans Formular melden
  if (String(env.CONTACT_BESTAETIGUNG || '').toLowerCase() !== 'aus') {
    const b = bestaetigungMail(d);
    await mailSenden(env, { an: d.email, betreff: b.betreff, html: b.html, antwortAn: env.CONTACT_TO || 'info@kruckenhaus.at' });
  }
  return json({ ok: true });
}

export async function onRequest({ request, env, params }) {
  const pfad = [].concat(params.pfad || []);
  try {
    if (request.method === 'POST' && pfad.length === 1 && pfad[0] === 'anmeldung') return await anmelden(request, env);
    if (request.method === 'GET' && pfad.length === 1 && pfad[0] === 'neuigkeiten') {
      const neuigkeiten = env.DB ? await neuigkeitenOeffentlich(env.DB) : [];
      return json({ ok: true, neuigkeiten });
    }
    return json({ ok: false, error: 'Nicht gefunden.' }, 404);
  } catch (fehler) {
    console.error('Eier – Fehler:', String(fehler && fehler.message));
    return json({ ok: false, error: 'Interner Fehler – bitte später noch einmal versuchen.' }, 500);
  }
}
