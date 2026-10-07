/* ============================================================
 * CLOUDFLARE PAGES FUNCTION – Kontaktformular
 * ============================================================
 * Erreichbar unter  /api/kontakt  (POST, JSON).
 * Ersetzt das frühere Netlify-Forms-Backend.
 *
 * Ablauf pro Anfrage:
 *   1. Spam-Schutz (Honeypot-Feld "bot-field").
 *   2. Pflichtfelder validieren (name, email und entweder Nachricht
 *      oder Zeitraum – Terminanfragen aus dem Buchungskalender auf
 *      preise.html dürfen ohne Nachricht kommen).
 *   3. Anfrage in der D1-Datenbank speichern (Tabelle "anfragen").
 *      Bewusst OHNE IP-Adresse und Browserkennung – die Datenschutz-
 *      erklärung sagt das so zu, und der Honeypot reicht als Spamschutz.
 *   4. Benachrichtigungs-E-Mail an info@kruckenhaus.at (via Resend).
 *   5. Eingangsbestätigung an den Gast (via Resend), Antworten darauf
 *      gehen an info@kruckenhaus.at. Bewusst ohne den Nachrichtentext:
 *      Wer eine fremde Adresse einträgt, kann so keine eigenen Inhalte
 *      über unseren Absender verschicken.
 *
 * Bindings / Variablen (Cloudflare → Pages → Settings):
 *   D1-Datenbank-Binding:  DB            (→ D1-Datenbank "kruckenhaus")
 *   Secret:  RESEND_API_KEY              (API-Key von resend.com)
 *   Variable (optional): CONTACT_TO      Standard: info@kruckenhaus.at
 *   Variable (optional): CONTACT_FROM    Standard: website@kruckenhaus.at
 *                                        (Domain muss in Resend verifiziert sein)
 *   Variable (optional): CONTACT_BESTAETIGUNG  "aus" schaltet die
 *                                        Eingangsbestätigung an den Gast ab
 *
 * Fehlt RESEND_API_KEY, wird die Anfrage trotzdem in D1 gespeichert –
 * es geht dann nur keine E-Mail raus (kein harter Fehler fürs Frontend).
 * ============================================================ */

import { BETRIEB, mailHtml, absatz, klein, kasten, gruss, textAusHtml } from '../_lib/mail.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Für die E-Mail: HTML gegen Einschleusen absichern.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function readPayload(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    return await request.json();
  }
  // Fallback: klassische Formular-Kodierung
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

// Gemeinsamer Versand über die Resend-API.
async function resendSenden(env, mail) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mail),
  });

  if (!res.ok) await resendFehlerProtokollieren(res);
  return { sent: res.ok, reason: res.ok ? null : `resend-http-${res.status}` };
}

async function sendEmail(env, data) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'no-api-key' };

  const to = env.CONTACT_TO || 'info@kruckenhaus.at';
  const from = env.CONTACT_FROM || `${BETRIEB} <website@kruckenhaus.at>`;

  const rows = [
    ['Name', data.name],
    ['E-Mail', data.email],
    ['Telefon', data.phone],
    ['Anreise', data.anreise],
    ['Abreise', data.abreise],
    ['Personen', data.personen],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:700">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join('');

  const html = mailHtml({
    art: 'hof',
    titel: 'Neue Anfrage über kruckenhaus.at',
    inhalt:
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${rows}</table>` +
      absatz('<strong>Nachricht:</strong>') +
      `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(data.message)}</p>`,
  });

  return resendSenden(env, {
    from,
    to,
    reply_to: data.email,
    subject: `Neue Anfrage von ${data.name}`,
    html,
    text: textAusHtml(html),
  });
}

// "2026-10-06" → "06.10.2026"; alles andere unverändert lassen.
function datumDeutsch(wert) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : wert;
}

// Eingangsbestätigung an den Gast. Enthält nur Name (gekürzt), Zeitraum
// und Personenzahl – nie den frei eingegebenen Nachrichtentext.
async function sendBestaetigung(env, data) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'no-api-key' };
  if (String(env.CONTACT_BESTAETIGUNG || '').toLowerCase() === 'aus') {
    return { sent: false, reason: 'abgeschaltet' };
  }

  const antwortAn = env.CONTACT_TO || 'info@kruckenhaus.at';
  const from = env.CONTACT_FROM || `${BETRIEB} <website@kruckenhaus.at>`;
  const name = data.name.slice(0, 60);
  // Terminanfrage (mit Zeitraum) oder allgemeine Frage, z. B. zum Hof oder Hofladen
  const mitZeitraum = Boolean(data.anreise && data.abreise);
  const art = mitZeitraum ? 'Anfrage' : 'Nachricht';
  const terminHinweis = 'Die Anfrage ist unverbindlich – fix reserviert ist euer Termin erst mit unserer Bestätigung.';

  const zeilen = [
    ['Anreise', datumDeutsch(data.anreise)],
    ['Abreise', datumDeutsch(data.abreise)],
    ['Personen', data.personen.slice(0, 20)],
  ].filter(([, v]) => v);

  const tabelle = zeilen.length
    ? absatz('Eure Angaben:') +
      kasten(zeilen.map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`).join('<br>'))
    : '';

  const html = mailHtml({
    titel: `Eure ${art} ist angekommen`,
    vorschau: 'Wir melden uns innerhalb von 24 Stunden persönlich bei euch.',
    inhalt:
      absatz(`Hallo ${escapeHtml(name)},`) +
      absatz(`danke für eure ${art}! Sie ist gut bei uns angekommen. Wir melden uns innerhalb von 24 Stunden persönlich bei euch.`) +
      tabelle +
      (mitZeitraum ? absatz(terminHinweis) : '') +
      absatz('Etwas vergessen oder eilig? Antwortet einfach auf diese E-Mail oder ruft uns an: ' +
        '<a href="tel:+436642166181">+43 664 2166181</a> (auch WhatsApp).') +
      gruss +
      klein('Diese E-Mail wurde automatisch verschickt, weil über unsere Website eine Anfrage mit dieser Adresse gestellt wurde.'),
  });
  const text = textAusHtml(html);

  return resendSenden(env, {
    from,
    to: data.email,
    reply_to: antwortAn,
    subject: `Eure ${art} an den ${BETRIEB} ist angekommen`,
    html,
    text,
  });
}

// Abgelehnte Mails sichtbar machen (Cloudflare → Deployments → Functions →
// Real-time Logs). Nur Statuscode und Resend-Fehlertext, keine Gastdaten.
async function resendFehlerProtokollieren(res) {
  let fehler = {};
  try {
    fehler = await res.json();
  } catch {
    // Antwort war kein JSON – Statuscode reicht dann
  }
  console.error(
    `Resend hat die E-Mail abgelehnt: HTTP ${res.status}` +
      (fehler.name ? ` (${fehler.name})` : '') +
      (fehler.message ? ` – ${String(fehler.message).slice(0, 200)}` : '')
  );
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await readPayload(request);
  } catch {
    return json({ ok: false, error: 'Ungültige Anfrage.' }, 400);
  }

  // 1. Honeypot – Bots füllen dieses versteckte Feld aus.
  if (payload['bot-field']) {
    return json({ ok: true }); // still ins Leere laufen lassen
  }

  // 2. Validierung
  const data = {
    name: (payload.name || '').trim(),
    email: (payload.email || '').trim(),
    phone: (payload.phone || '').trim(),
    anreise: (payload.anreise || '').trim(),
    abreise: (payload.abreise || '').trim(),
    personen: (payload.personen || '').trim(),
    message: (payload.message || '').trim(),
  };

  const mitZeitraum = Boolean(data.anreise && data.abreise);
  if (!data.name || !data.email || (!data.message && !mitZeitraum)) {
    return json({ ok: false, error: 'Bitte füllt alle Pflichtfelder aus.' }, 400);
  }
  if (!isValidEmail(data.email)) {
    return json({ ok: false, error: 'Bitte gebt eine gültige E-Mail-Adresse ein.' }, 400);
  }
  if (!mitZeitraum && data.message.length < 10) {
    return json({ ok: false, error: 'Bitte beschreibt euer Anliegen etwas ausführlicher.' }, 400);
  }
  if (!data.message) {
    // Spalte "nachricht" ist NOT NULL – reine Terminanfrage kennzeichnen
    data.message = 'Terminanfrage über den Buchungskalender (ohne Nachricht).';
  }
  if (data.anreise && data.abreise && data.abreise <= data.anreise) {
    return json({ ok: false, error: 'Die Abreise muss nach der Anreise liegen.' }, 400);
  }

  // 3. In D1 speichern (Archiv aller Anfragen)
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO anfragen (name, email, telefon, anreise, abreise, personen, nachricht)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          data.name,
          data.email,
          data.phone || null,
          data.anreise || null,
          data.abreise || null,
          data.personen || null,
          data.message
        )
        .run();
    } catch (err) {
      // Speichern darf die Zustellung nicht blockieren – nur protokollieren.
      console.error('D1-Insert fehlgeschlagen:', err);
    }
  }

  // 4. Benachrichtigungs-E-Mail
  try {
    await sendEmail(env, data);
  } catch (err) {
    console.error('E-Mail-Versand fehlgeschlagen:', err);
  }

  // 5. Eingangsbestätigung an den Gast – Fehler hier nie ans Formular melden
  try {
    await sendBestaetigung(env, data);
  } catch (err) {
    console.error('Eingangsbestätigung fehlgeschlagen:', err);
  }

  return json({ ok: true });
}
