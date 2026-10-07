/* ============================================================
 * E-MAIL-VORLAGE – gemeinsames Aussehen aller Mails (keine Route)
 * ============================================================
 * Alle automatischen Mails (Kontaktformular, Hofladen, Verwaltung) bekommen
 * denselben Rahmen: Kopf „Bergbauernhof Kruckenhaus" in den Hausfarben,
 * gut lesbar am Handy, Fußzeile mit Adresse, Telefon, WhatsApp und
 * Impressum. Dazu eine Nur-Text-Fassung (bessere Zustellung, weniger Spam).
 *
 * Mail-Programme kennen kein CSS aus style.css und keine Custom
 * Properties – deshalb Tabellen-Layout und Farben direkt als Hex-Werte
 * (dieselben wie in :root von css/style.css). Keine Bilder, keine
 * externen Ressourcen: viele Programme blockieren sie ohnehin.
 *
 * Bewusst ohne Abhängigkeit zu hofladen.js, damit beide Dateien sich
 * gegenseitig nutzen können.
 * ============================================================ */

export const BETRIEB = 'Bergbauernhof Kruckenhaus';

// Hausfarben (css/style.css, Abschnitt 2)
const FARBE = {
  primaer: '#2F5848',
  terracotta: '#964F33',
  beige: '#F0E6DD',
  creme: '#F5F0EB',
  text: '#464646',
  hell: '#6B6158',
  linie: '#D4CBC3',
  weiss: '#FFFFFF',
};

const SCHRIFT = 'Arial,Helvetica,sans-serif';
const TITELSCHRIFT = "Georgia,'Times New Roman',serif";

function esc(wert) {
  return String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// „Abholung am Hof: Samstag, 24. Oktober, 09:00–12:00 Uhr"
function datumText(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('de-AT', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

export function terminText(t) {
  if (!t) return 'Termin wird noch vereinbart';
  const art = t.art === 'abholung' ? 'Abholung am Hof' : 'Lieferung';
  const zeit = t.von && t.bis ? `, ${t.von}–${t.bis} Uhr` : '';
  return `${art}: ${datumText(t.datum)}${zeit}`;
}

const euroFormat = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
const euro = (cent) => euroFormat.format(cent / 100);

/* ------------------------------------------------------------
   1. BAUSTEINE für den Inhalt
   ------------------------------------------------------------ */
export const absatz = (html) => `<p style="margin:0 0 16px">${html}</p>`;

export const klein = (html) => `<p style="margin:0 0 16px;font-size:14px;color:${FARBE.hell}">${html}</p>`;

// Knopf, der auch in Outlook als Knopf erscheint (Tabelle statt CSS-Button)
export function knopf(href, text) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr>
    <td style="background-color:${FARBE.primaer};border-radius:8px">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-family:${SCHRIFT};font-size:15px;font-weight:700;color:${FARBE.weiss};text-decoration:none">${esc(text)}</a>
    </td></tr></table>`;
}

// Hervorgehobener Kasten (Bestellnummer, Termin, Zahlung …)
export function kasten(html) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
    <td style="background-color:${FARBE.creme};border-left:4px solid ${FARBE.primaer};border-radius:6px;padding:14px 16px;font-size:15px;line-height:1.6">${html}</td>
  </tr></table>`;
}

// Liste der Positionen mit Summe. zeilen aus v_positionen:
// { produkt_name, art, menge, einzelpreis_cent, betrag_cent, geschaetzt }
export function positionenHtml(zeilen) {
  const summe = zeilen.reduce((s, z) => s + z.betrag_cent, 0);
  const geschaetzt = zeilen.some((z) => z.geschaetzt);
  const reihen = zeilen.map((z) => `<tr>
      <td style="padding:8px 12px 8px 0;border-bottom:1px solid ${FARBE.linie}">${z.menge}× ${esc(z.produkt_name)}<br data-text=" – ">
        <span style="font-size:13px;color:${FARBE.hell}">${z.art === 'gewicht' ? `${euro(z.einzelpreis_cent)}/kg` : `je ${euro(z.einzelpreis_cent)}`}</span></td>
      <td style="padding:8px 0;border-bottom:1px solid ${FARBE.linie};text-align:right;white-space:nowrap">${z.geschaetzt ? 'ca. ' : ''}${euro(z.betrag_cent)}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;font-size:15px">${reihen}
    <tr><td style="padding:10px 12px 0 0;font-weight:700">Summe</td>
      <td style="padding:10px 0 0;text-align:right;font-weight:700;white-space:nowrap">${geschaetzt ? 'ca. ' : ''}${euro(summe)}</td></tr>
  </table>${geschaetzt
    ? klein('Fleisch wird nach Gewicht abgerechnet – den genauen Betrag erfahrt ihr bei der Abholung bzw. Lieferung.')
    : '<div style="height:12px"></div>'}`;
}

/* ------------------------------------------------------------
   2. RAHMEN
   art: 'kunde' (mit Fußzeile für Kunden) oder 'hof' (interne Mail,
   schlichter Fuß). vorschau: Text, den Mail-Programme in der Liste zeigen.
   ------------------------------------------------------------ */
export function mailHtml({ titel = '', inhalt, vorschau = '', art = 'kunde' }) {
  const fuss = art === 'hof'
    ? `Automatische Nachricht der Website · <a href="https://www.kruckenhaus.at/verwaltung/" style="color:${FARBE.hell}">Verwaltung öffnen</a>`
    : `${BETRIEB} · Kathrin &amp; Florian Häusler<br>
       Oberberg 70 · 6252 Breitenbach am Inn · Tirol<br>
       <a href="tel:+436642166181" style="color:${FARBE.hell}">+43 664 2166181</a> ·
       <a href="https://wa.me/436642166181" style="color:${FARBE.hell}">WhatsApp</a> ·
       <a href="mailto:info@kruckenhaus.at" style="color:${FARBE.hell}">info@kruckenhaus.at</a><br>
       <a href="https://www.kruckenhaus.at" style="color:${FARBE.hell}">kruckenhaus.at</a> ·
       <a href="https://www.kruckenhaus.at/impressum.html" style="color:${FARBE.hell}">Impressum</a> ·
       <a href="https://www.kruckenhaus.at/datenschutz.html" style="color:${FARBE.hell}">Datenschutz</a>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(titel || BETRIEB)}</title></head>
<body style="margin:0;padding:0;background-color:${FARBE.beige}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(vorschau)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${FARBE.beige}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:${FARBE.weiss};border-radius:12px;overflow:hidden">
    <tr><td style="background-color:${FARBE.primaer};padding:22px 28px">
      <div style="font-family:${TITELSCHRIFT};font-size:24px;line-height:1.2;color:${FARBE.weiss}">${BETRIEB}</div>
      <div style="font-family:${SCHRIFT};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${FARBE.beige};margin-top:4px">Breitenbach am Inn · Tirol</div>
    </td></tr>
    <tr><td style="padding:28px 28px 12px;font-family:${SCHRIFT};font-size:16px;line-height:1.55;color:${FARBE.text}">
      ${titel ? `<h1 style="margin:0 0 18px;font-family:${TITELSCHRIFT};font-size:22px;line-height:1.3;font-weight:normal;color:${FARBE.primaer}">${esc(titel)}</h1>` : ''}
      ${inhalt.replace(/<a href=/g, `<a style="color:${FARBE.primaer};font-weight:700" href=`)}
    </td></tr>
    <tr><td style="padding:18px 28px 24px;border-top:1px solid ${FARBE.linie};font-family:${SCHRIFT};font-size:12px;line-height:1.6;color:${FARBE.hell}">
      ${fuss}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// Gruß am Ende jeder Kunden-Mail
export const gruss = absatz('Liebe Grüße vom Hof<br>Kathrin &amp; Florian');

/* ------------------------------------------------------------
   3. NUR-TEXT-FASSUNG
   Aus dem HTML abgeleitet: Zeilenumbrüche an Absätzen und Tabellenzeilen,
   Links als „Text (Adresse)", Entities zurückverwandelt.
   ------------------------------------------------------------ */
export function textAusHtml(html) {
  return String(html)
    .replace(/<span style="display:none[^>]*>[\s\S]*?<\/span>/i, '')
    .replace(/<(head|title|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Zeilenumbrüche im Quelltext zählen nicht – nur die aus den Tags
    .replace(/\s+/g, ' ')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const t = text.replace(/<[^>]+>/g, '').trim();
      // Telefon und E-Mail stehen schon lesbar im Text
      if (/^(tel|mailto):/i.test(href) || href.replace(/^https?:\/\/(www\.)?/, '').startsWith(t)) return t;
      return `${t}: ${href}`;
    })
    // Zeilenumbruch, der in der Text-Fassung ein Trenner sein soll
    .replace(/<br data-text="([^"]*)">/gi, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|table)>/gi, '\n\n')
    .replace(/<\/(tr|div)>/gi, '\n')
    .replace(/<\/td>\s*<td[^>]*>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((z) => z.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
