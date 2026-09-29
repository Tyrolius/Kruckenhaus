/* ============================================================
 * MEINE BESTELLUNGEN (meine-bestellungen.html)
 * ============================================================
 * Zeigt Vorbestellungen und Voranmeldungen zum persönlichen Link aus der
 * Bestätigungsmail. Der Schlüssel steht hinter „#" in der Adresse – er wird
 * nur im Header X-Link-Schluessel an /api/hofladen/meine geschickt und taucht
 * so weder in Server-Protokollen noch als Referrer auf.
 * Steht der genaue Betrag fest und ist eine Überweisung offen, erscheint ein
 * QR-Code für die Banking-App (js/qrcode.js).
 * Keine Cookies, kein localStorage.
 * ============================================================ */

'use strict';

/* ------------------------------------------------------------
   1. HELFER
   ------------------------------------------------------------ */
const mbEuro = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
const mbKg = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function mbEsc(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mbTermin(t) {
  if (!t) return 'Termin wird noch mit euch vereinbart';
  const datum = new Date(`${t.datum}T12:00:00`).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
  const zeit = t.von && t.bis ? `, ${t.von}–${t.bis} Uhr` : '';
  return `${t.art === 'abholung' ? 'Abholung am Hof' : 'Lieferung'} – ${datum}${zeit}`;
}

const MB_STATUS = {
  vorgemerkt: ['Fix vorgemerkt', 'gut'],
  warteliste: ['Warteliste', 'info'],
  storniert: ['Storniert', 'grau'],
};

/* ------------------------------------------------------------
   2. ANZEIGE
   ------------------------------------------------------------ */
// Überweisungsdaten mit QR-Code – nur wenn alles gewogen und noch nicht bezahlt
function mbUeberweisung(b, bank) {
  if (!bank || b.status !== 'vorgemerkt' || b.zahlart !== 'ueberweisung' || b.bezahlt || b.geschaetzt || !(b.summeCent > 0)) return '';
  const zweck = `Bestellung ${b.nummer}`;
  let qr = '';
  if (window.KruckenhausQr) {
    try {
      const epc = KruckenhausQr.epcText({ name: bank.inhaber, iban: bank.iban, bic: bank.bic, betragCent: b.summeCent, zweck });
      qr = `<div class="hl-qr">${KruckenhausQr.svg(epc, { titel: `QR-Code für die Überweisung von ${mbEuro.format(b.summeCent / 100)}` })}</div>`;
    } catch {
      qr = '';
    }
  }
  return `<div class="hl-ueberweisung">
    ${qr}
    <div>
      <p><strong>Jetzt überweisen</strong><br><small>QR-Code mit der Banking-App scannen – Betrag und Verwendungszweck sind schon ausgefüllt.</small></p>
      <dl class="hl-bankdaten">
        <dt>Empfänger</dt><dd>${mbEsc(bank.inhaber)}</dd>
        <dt>IBAN</dt><dd>${mbEsc(bank.iban)}</dd>
        ${bank.bic ? `<dt>BIC</dt><dd>${mbEsc(bank.bic)}</dd>` : ''}
        <dt>Betrag</dt><dd>${mbEuro.format(b.summeCent / 100)}</dd>
        <dt>Verwendungszweck</dt><dd>${mbEsc(zweck)}</dd>
      </dl>
    </div>
  </div>`;
}

function mbBestellung(b, bank) {
  const [statusText, statusArt] = MB_STATUS[b.status] || [b.status, 'grau'];
  const marken = [`<span class="hl-marke hl-marke--${statusArt}">${statusText}</span>`];
  if (b.status === 'vorgemerkt') {
    marken.push(b.bezahlt
      ? '<span class="hl-marke hl-marke--gut">bezahlt</span>'
      : `<span class="hl-marke">Zahlung: ${b.zahlart === 'ueberweisung' ? 'Überweisung' : 'bar'}</span>`);
    if (b.uebergeben) marken.push('<span class="hl-marke hl-marke--gut">übergeben</span>');
  }
  const zeilen = b.positionen.map((p) => {
    const detail = p.art === 'gewicht'
      ? (p.gewichtG ? `${mbKg.format(p.gewichtG / 1000)} kg × ${mbEuro.format(p.preisCent / 100)}/kg` : `${mbEuro.format(p.preisCent / 100)}/kg, wird noch gewogen`)
      : `je ${mbEuro.format(p.preisCent / 100)}`;
    return `<tr><td>${p.menge}× ${mbEsc(p.name)}<br><small>${detail}</small></td>
      <td class="hl-zahl">${p.geschaetzt ? 'ca. ' : ''}${mbEuro.format(p.betragCent / 100)}</td></tr>`;
  }).join('');

  return `<article class="hl-meine-bestellung${b.status === 'storniert' ? ' hl-meine-bestellung--grau' : ''}">
    <header><strong>${mbEsc(b.charge)}</strong><span class="form-hint">Nr. ${mbEsc(b.nummer)}</span></header>
    <div class="hl-marken">${marken.join('')}</div>
    <p>${mbEsc(mbTermin(b.termin))}${b.lieferadresse && b.termin && b.termin.art === 'lieferung' ? `<br><small>${mbEsc(b.lieferadresse)}</small>` : ''}</p>
    <table class="hl-tabelle"><tbody>${zeilen}</tbody>
      <tfoot><tr><td>Summe</td><td class="hl-zahl">${b.geschaetzt ? 'ca. ' : ''}${mbEuro.format(b.summeCent / 100)}</td></tr></tfoot>
    </table>
    ${b.geschaetzt && b.status !== 'storniert' ? '<p class="form-hint">Fleisch wird nach Gewicht abgerechnet – den genauen Betrag erfahrt ihr bei der Übergabe.</p>' : ''}
    ${mbUeberweisung(b, bank)}
  </article>`;
}

function mbZeigen(daten) {
  const ziel = document.getElementById('mb-inhalt');
  const offen = daten.bestellungen.filter((b) => b.status !== 'storniert');
  const storniert = daten.bestellungen.filter((b) => b.status === 'storniert');
  ziel.innerHTML = `
    <p>Hallo ${mbEsc(daten.name)}!</p>
    ${offen.length ? offen.map((b) => mbBestellung(b, daten.bank)).join('') : '<p class="hl-leer">Keine aktuellen Vorbestellungen.</p>'}
    ${daten.voranmeldungen.length ? `<h2 class="hl-meine-unter">Vorgemerkt für später</h2>
      <ul class="hl-voranmeldungen">${daten.voranmeldungen.map((v) =>
        `<li><strong>${v.menge}× ${mbEsc(v.produkt)}</strong> – ${mbEsc(v.zeitraumText)} <small>(unverbindlich)</small></li>`).join('')}</ul>` : ''}
    ${storniert.length ? `<details class="hl-angaben"><summary>Stornierte Bestellungen (${storniert.length})</summary>${storniert.map((b) => mbBestellung(b, null)).join('')}</details>` : ''}
    <p><a class="btn btn-primary" href="hofladen.html">Zum Hofladen</a></p>`;
}

/* ------------------------------------------------------------
   3. START
   ------------------------------------------------------------ */
async function initMeineBestellungen() {
  const ziel = document.getElementById('mb-inhalt');
  if (!ziel) return;
  const schluessel = decodeURIComponent(location.hash.slice(1));
  const fehlerText = `<div class="hl-leer"><p><strong>Dieser Link funktioniert leider nicht.</strong></p>
    <p>Bitte öffnet den Link direkt aus eurer Bestätigungsmail – oder ruft uns an: <a href="tel:+436642166181">+43 664 2166181</a>.</p></div>`;
  if (!schluessel) {
    ziel.innerHTML = fehlerText;
    return;
  }
  try {
    const antwort = await fetch('/api/hofladen/meine', {
      headers: { Accept: 'application/json', 'X-Link-Schluessel': schluessel },
      cache: 'no-store',
    });
    const daten = await antwort.json().catch(() => ({}));
    if (!antwort.ok || !daten.ok) {
      ziel.innerHTML = fehlerText;
      return;
    }
    mbZeigen(daten);
  } catch {
    ziel.innerHTML = '<div class="hl-leer"><p>Keine Verbindung – bitte später noch einmal versuchen.</p></div>';
  }
}

document.addEventListener('DOMContentLoaded', initMeineBestellungen);
