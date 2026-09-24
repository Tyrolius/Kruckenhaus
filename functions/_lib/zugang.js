/* ============================================================
 * ZUGANGSPRÜFUNG – Hofladen-Verwaltung (Cloudflare Access)
 * ============================================================
 * Cloudflare Access schützt /verwaltung/* und /api/verwaltung/* mit einer
 * Anmeldung per E-Mail-Code. Access hängt an jede durchgelassene Anfrage
 * ein signiertes Token (Header Cf-Access-Jwt-Assertion). Diese Datei prüft
 * das Token zusätzlich selbst – fällt Access versehentlich weg oder wird
 * die Seite über eine andere Adresse (z. B. *.pages.dev) aufgerufen, gibt
 * die Schnittstelle trotzdem nichts heraus.
 *
 * Geprüft wird: Signatur (Schlüssel von Access), Ablaufzeit, Aussteller,
 * Anwendung (Audience) und ob die E-Mail-Adresse freigegeben ist.
 *
 * Einstellungen (Cloudflare → Pages → kruckenhaus → Einstellungen →
 * Variablen und Geheimnisse, jeweils als „Geheimnis"/Secret):
 *   ACCESS_TEAM_DOMAIN   z. B. kruckenhaus.cloudflareaccess.com
 *   ACCESS_AUD           „Application Audience (AUD) Tag" der Access-App
 *                        (mehrere durch Komma getrennt, z. B. zusätzlich die
 *                        Access-App der Vorschau-Adressen *.pages.dev)
 *   VERWALTUNG_EMAILS    freigegebene Adressen, durch Komma getrennt
 *
 * Fehlt eine davon, bleibt die Verwaltung gesperrt (bewusst KEIN
 * „graceful degradation" – hier geht Sicherheit vor).
 *
 * Nur für lokale Tests (npx wrangler pages dev):
 *   --binding VERWALTUNG_LOKAL=1  lässt Aufrufe von localhost/127.0.0.1 ohne
 *   Token zu. Auf der echten Adresse wirkt das nie.
 * ============================================================ */

let schluesselCache = { domain: null, geholt: 0, schluessel: new Map() };
const CACHE_MS = 60 * 60 * 1000;
// Unbekannter Schlüssel (z. B. nach einem Schlüsselwechsel bei Access):
// höchstens alle 5 Minuten neu abrufen, damit gefälschte Tokens keine
// Abruf-Flut auslösen.
const NEU_ABRUF_MS = 5 * 60 * 1000;

function base64UrlZuBytes(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function base64UrlZuJson(text) {
  return JSON.parse(new TextDecoder().decode(base64UrlZuBytes(text)));
}

async function schluesselLaden(domain, kid, holen) {
  const alter = schluesselCache.domain === domain ? Date.now() - schluesselCache.geholt : Infinity;
  if (alter < CACHE_MS && schluesselCache.schluessel.has(kid)) return schluesselCache.schluessel.get(kid);
  if (alter < NEU_ABRUF_MS) return undefined;

  const antwort = await holen(`https://${domain}/cdn-cgi/access/certs`);
  if (!antwort.ok) throw new Error(`Access-Schlüssel nicht abrufbar (${antwort.status})`);
  const { keys = [] } = await antwort.json();
  const schluessel = new Map();
  for (const jwk of keys) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    schluessel.set(jwk.kid, await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    ));
  }
  schluesselCache = { domain, geholt: Date.now(), schluessel };
  return schluessel.get(kid);
}

export function erlaubteEmails(env) {
  return String(env.VERWALTUNG_EMAILS || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Prüft den Zugang zur Verwaltung.
 * @param {Request} request
 * @param {object} env
 * @param {Function} [holen] fetch-Ersatz (nur für Tests)
 * @returns {Promise<{ ok: true, email: string } | { ok: false, status: number, fehler: string }>}
 */
export async function zugangPruefen(request, env, holen = fetch) {
  const url = new URL(request.url);
  if (env.VERWALTUNG_LOKAL === '1' && ['localhost', '127.0.0.1'].includes(url.hostname)) {
    return { ok: true, email: 'lokal' };
  }

  const domain = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const audErlaubt = String(env.ACCESS_AUD || '').split(/[,;\s]+/).map((a) => a.trim()).filter(Boolean);
  const emails = erlaubteEmails(env);
  if (!domain || !audErlaubt.length || !emails.length) {
    return { ok: false, status: 503, fehler: 'Die Verwaltung ist noch nicht eingerichtet (Zugangsschutz fehlt).' };
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, status: 401, fehler: 'Nicht angemeldet.' };

  try {
    const [kopfTeil, inhaltTeil, signaturTeil] = token.split('.');
    if (!kopfTeil || !inhaltTeil || !signaturTeil) throw new Error('Token unvollständig');
    const kopf = base64UrlZuJson(kopfTeil);
    const inhalt = base64UrlZuJson(inhaltTeil);
    if (kopf.alg !== 'RS256') throw new Error('Unerwartetes Verfahren');

    const schluessel = await schluesselLaden(domain, kopf.kid, holen);
    if (!schluessel) throw new Error('Unbekannter Schlüssel');
    const gueltig = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      schluessel,
      base64UrlZuBytes(signaturTeil),
      new TextEncoder().encode(`${kopfTeil}.${inhaltTeil}`)
    );
    if (!gueltig) throw new Error('Signatur ungültig');

    const jetzt = Math.floor(Date.now() / 1000);
    if (!inhalt.exp || inhalt.exp < jetzt) throw new Error('Token abgelaufen');
    if (inhalt.nbf && inhalt.nbf > jetzt + 60) throw new Error('Token noch nicht gültig');
    if (inhalt.iss !== `https://${domain}`) throw new Error('Falscher Aussteller');
    const audListe = Array.isArray(inhalt.aud) ? inhalt.aud : [inhalt.aud];
    if (!audListe.some((a) => audErlaubt.includes(a))) throw new Error('Falsche Anwendung');

    const email = String(inhalt.email || '').toLowerCase();
    if (!emails.includes(email)) {
      return { ok: false, status: 403, fehler: 'Diese E-Mail-Adresse hat keinen Zugang zur Verwaltung.' };
    }
    return { ok: true, email };
  } catch (fehler) {
    console.error('Zugangsprüfung fehlgeschlagen:', fehler.message);
    return { ok: false, status: 401, fehler: 'Anmeldung ungültig oder abgelaufen – bitte Seite neu laden.' };
  }
}
