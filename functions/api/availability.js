/* ============================================================
 * CLOUDFLARE PAGES FUNCTION – Verfügbarkeit aus Airbnb-iCal
 * ============================================================
 * Erreichbar unter  /api/availability  (Pages routet automatisch
 * über den Dateipfad functions/api/availability.js).
 *
 * Ruft den/die Airbnb-Kalender (iCal-Export) ab und liefert die
 * belegten Zeiträume als JSON an das Frontend (js/verfuegbarkeit.js).
 *
 * Konfiguration (Cloudflare → Pages → Settings → Variables and Secrets):
 *   AIRBNB_ICAL_URL = https://www.airbnb.at/calendar/ical/XXXX.ics?s=...
 *   Mehrere Kalender: URLs mit Komma trennen.
 *
 * Die iCal-URL enthält ein Geheimnis und gehört deshalb NICHT in den
 * Code, sondern nur in die Cloudflare-Umgebungsvariable (als Secret).
 * ============================================================ */

/**
 * iCal-Zeilen "entfalten": Fortsetzungszeilen beginnen laut RFC 5545
 * mit Leerzeichen oder Tab und gehören zur vorherigen Zeile.
 */
function unfoldLines(ics) {
  return ics
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

/**
 * Datum aus iCal-Wert lesen. Airbnb liefert Ganztages-Termine
 * (DTSTART;VALUE=DATE:20260815), zur Sicherheit werden auch
 * Zeitstempel (20260815T140000Z) akzeptiert.
 * Rückgabe: "YYYY-MM-DD" oder null.
 */
function parseIcsDate(value) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Belegte Zeiträume aus einem iCal-Text ziehen.
 * DTEND ist bei Ganztages-Terminen exklusiv (= Abreisetag),
 * das Frontend rechnet damit.
 */
function parseBusyRanges(ics) {
  const ranges = [];
  let inEvent = false;
  let start = null;
  let end = null;
  let cancelled = false;

  for (const line of unfoldLines(ics)) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      start = end = null;
      cancelled = false;
    } else if (line === 'END:VEVENT') {
      if (inEvent && start && end && !cancelled) {
        ranges.push({ start, end });
      }
      inEvent = false;
    } else if (inEvent) {
      if (line.startsWith('DTSTART')) {
        start = parseIcsDate(line.slice(line.indexOf(':') + 1));
      } else if (line.startsWith('DTEND')) {
        end = parseIcsDate(line.slice(line.indexOf(':') + 1));
      } else if (line.startsWith('STATUS:') && line.includes('CANCELLED')) {
        cancelled = true;
      }
    }
  }
  return ranges;
}

export async function onRequestGet({ env }) {
  const urls = (env.AIRBNB_ICAL_URL || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  const jsonHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    // CDN cached 1 h – schont Airbnb und macht die Seite schnell
    'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
  };

  if (urls.length === 0) {
    return new Response(
      JSON.stringify({ configured: false, busy: [] }),
      { status: 200, headers: jsonHeaders }
    );
  }

  try {
    const busy = [];
    for (const url of urls) {
      const res = await fetch(url, { headers: { 'User-Agent': 'kruckenhaus.at Verfuegbarkeitskalender' } });
      if (!res.ok) throw new Error(`iCal-Abruf fehlgeschlagen (HTTP ${res.status})`);
      busy.push(...parseBusyRanges(await res.text()));
    }
    busy.sort((a, b) => a.start.localeCompare(b.start));

    return new Response(
      JSON.stringify({ configured: true, updatedAt: new Date().toISOString(), busy }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ configured: true, error: 'Kalender derzeit nicht abrufbar' }),
      { status: 502, headers: { ...jsonHeaders, 'Cache-Control': 'no-store' } }
    );
  }
}

// Für lokale Tests exportierbar (Parser sind reine Funktionen):
export const _internal = { parseBusyRanges, parseIcsDate, unfoldLines };
