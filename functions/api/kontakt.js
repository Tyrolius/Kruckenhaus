/* ============================================================
 * CLOUDFLARE PAGES FUNCTION – Kontaktformular
 * ============================================================
 * Erreichbar unter  /api/kontakt  (POST, JSON).
 * Ersetzt das frühere Netlify-Forms-Backend.
 *
 * Ablauf pro Anfrage:
 *   1. Spam-Schutz (Honeypot-Feld "bot-field").
 *   2. Pflichtfelder validieren (name, email, message).
 *   3. Anfrage in der D1-Datenbank speichern (Tabelle "anfragen").
 *   4. Benachrichtigungs-E-Mail an info@kruckenhaus.at (via Resend).
 *
 * Bindings / Variablen (Cloudflare → Pages → Settings):
 *   D1-Datenbank-Binding:  DB            (→ D1-Datenbank "kruckenhaus")
 *   Secret:  RESEND_API_KEY              (API-Key von resend.com)
 *   Variable (optional): CONTACT_TO      Standard: info@kruckenhaus.at
 *   Variable (optional): CONTACT_FROM    Standard: website@kruckenhaus.at
 *                                        (Domain muss in Resend verifiziert sein)
 *
 * Fehlt RESEND_API_KEY, wird die Anfrage trotzdem in D1 gespeichert –
 * es geht dann nur keine E-Mail raus (kein harter Fehler fürs Frontend).
 * ============================================================ */

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

async function sendEmail(env, data) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'no-api-key' };

  const to = env.CONTACT_TO || 'info@kruckenhaus.at';
  const from = env.CONTACT_FROM || 'Kruckenhaus Website <website@kruckenhaus.at>';

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

  const html =
    `<h2>Neue Anfrage über kruckenhaus.at</h2>` +
    `<table style="border-collapse:collapse">${rows}</table>` +
    `<p style="margin-top:16px"><strong>Nachricht:</strong></p>` +
    `<p style="white-space:pre-wrap">${escapeHtml(data.message)}</p>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: data.email,
      subject: `Neue Anfrage von ${data.name}`,
      html,
    }),
  });

  return { sent: res.ok, reason: res.ok ? null : `resend-http-${res.status}` };
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

  if (!data.name || !data.email || !data.message) {
    return json({ ok: false, error: 'Bitte füllen Sie alle Pflichtfelder aus.' }, 400);
  }
  if (!isValidEmail(data.email)) {
    return json({ ok: false, error: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' }, 400);
  }
  if (data.message.length < 10) {
    return json({ ok: false, error: 'Bitte beschreiben Sie Ihr Anliegen etwas ausführlicher.' }, 400);
  }
  if (data.anreise && data.abreise && data.abreise <= data.anreise) {
    return json({ ok: false, error: 'Die Abreise muss nach der Anreise liegen.' }, 400);
  }

  // 3. In D1 speichern (Archiv aller Anfragen)
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO anfragen (name, email, telefon, anreise, abreise, personen, nachricht, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          data.name,
          data.email,
          data.phone || null,
          data.anreise || null,
          data.abreise || null,
          data.personen || null,
          data.message,
          request.headers.get('cf-connecting-ip') || null,
          request.headers.get('user-agent') || null
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

  return json({ ok: true });
}
