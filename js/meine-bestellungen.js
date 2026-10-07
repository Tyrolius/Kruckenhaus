/* ============================================================
 * MEINE BESTELLUNGEN (meine-bestellungen.html)
 * ============================================================
 * Zeigt Vorbestellungen und Voranmeldungen zum persönlichen Link aus der
 * Bestätigungsmail. Der Schlüssel steht hinter „#" in der Adresse – er wird
 * nur im Header X-Link-Schluessel an /api/hofladen/meine geschickt und taucht
 * so weder in Server-Protokollen noch als Referrer auf.
 * Steht der genaue Betrag fest und ist eine Überweisung offen, erscheint ein
 * QR-Code für die Banking-App (js/qrcode.js).
 * Je Bestellung gibt es „Vertrag widerrufen" (§ 13a FAGG): Knopf, Auswahl,
 * „Widerruf bestätigen" – an /api/hofladen/widerruf, mit demselben Schlüssel.
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
    ${b.status === 'storniert' ? '' : mbWiderruf(b)}
  </article>`;
}

// „Vertrag widerrufen": bereits eingegangene Widerrufe und der Knopf dazu
function mbWiderruf(b) {
  const eingegangen = (b.widerrufe || []).map((w) =>
    `<p class="hl-widerruf-hinweis">Widerruf eingegangen am ${mbEsc(w.eingegangen)} Uhr: ${mbEsc(w.umfang)}</p>`).join('');
  return `<div class="hl-widerruf" data-nummer="${mbEsc(b.nummer)}">
    ${eingegangen}
    <button type="button" class="btn btn-outline hl-widerruf-knopf" aria-expanded="false">Vertrag widerrufen</button>
    <form class="hl-widerruf-form contact-form" hidden novalidate>
      <p>Für Nudeln, Honig und Seife könnt ihr innerhalb von 14 Tagen ab Übergabe zurücktreten,
        für frisches Fleisch gilt das nicht.</p>
      <fieldset class="hl-feldgruppe">
        <legend>Was wollt ihr widerrufen?</legend>
        <label class="hl-auswahl"><input type="radio" name="umfang" value="ganz" checked /> <span>Die ganze Bestellung ${mbEsc(b.nummer)}</span></label>
        <label class="hl-auswahl"><input type="radio" name="umfang" value="teil" /> <span>Nur einzelne Produkte</span></label>
      </fieldset>
      <div class="form-group" data-produkte hidden>
        <label>Welche Produkte?<textarea name="produkte" rows="2" placeholder="z. B. 2× Honig 500 g"></textarea></label>
      </div>
      <button type="submit" class="btn btn-primary hl-knopf-breit">Widerruf bestätigen</button>
      <p class="hl-meldung" role="status" aria-live="polite"></p>
    </form>
  </div>`;
}

async function mbWiderrufSenden(form, schluessel) {
  const bereich = form.closest('.hl-widerruf');
  const meldung = form.querySelector('.hl-meldung');
  const umfang = form.querySelector('input[name="umfang"]:checked').value;
  const produkte = form.elements.namedItem('produkte').value.trim();
  if (umfang === 'teil' && !produkte) {
    meldung.textContent = 'Bitte angeben, welche Produkte ihr widerrufen wollt.';
    meldung.className = 'hl-meldung hl-meldung--fehler';
    return;
  }
  const knopf = form.querySelector('button[type="submit"]');
  knopf.disabled = true;
  meldung.textContent = 'Wird gesendet …';
  meldung.className = 'hl-meldung';
  try {
    const antwort = await fetch('/api/hofladen/widerruf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Link-Schluessel': schluessel },
      body: JSON.stringify({ bestellnummer: bereich.dataset.nummer, umfang, produkte }),
    });
    const erg = await antwort.json().catch(() => ({}));
    if (!antwort.ok || !erg.ok) throw new Error(erg.error || 'Das hat leider nicht geklappt – bitte ruft uns an: +43 664 2166181.');
    bereich.innerHTML = `<div class="hl-widerruf-bestaetigt">
      <strong>Euer Widerruf ist eingegangen</strong>
      <p>Bestellung ${mbEsc(erg.nummer)} · widerrufen: ${mbEsc(erg.umfang)}<br>Eingegangen am ${mbEsc(erg.eingegangen)} Uhr.
        Die Bestätigung ist per E-Mail unterwegs.</p></div>`;
  } catch (f) {
    meldung.textContent = f.message || 'Keine Verbindung – bitte später noch einmal versuchen.';
    meldung.className = 'hl-meldung hl-meldung--fehler';
    knopf.disabled = false;
  }
}

function mbWiderrufVorbereiten(ziel, schluessel) {
  ziel.addEventListener('click', (e) => {
    const knopf = e.target.closest('.hl-widerruf-knopf');
    if (!knopf) return;
    const form = knopf.nextElementSibling;
    form.hidden = false;
    knopf.setAttribute('aria-expanded', 'true');
    knopf.hidden = true;
  });
  ziel.addEventListener('change', (e) => {
    if (e.target.name !== 'umfang') return;
    e.target.closest('form').querySelector('[data-produkte]').hidden = e.target.value !== 'teil';
  });
  ziel.addEventListener('submit', (e) => {
    if (!e.target.classList.contains('hl-widerruf-form')) return;
    e.preventDefault();
    mbWiderrufSenden(e.target, schluessel);
  });
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
    mbWiderrufVorbereiten(ziel, schluessel);
  } catch {
    ziel.innerHTML = '<div class="hl-leer"><p>Keine Verbindung – bitte später noch einmal versuchen.</p></div>';
  }
}

document.addEventListener('DOMContentLoaded', initMeineBestellungen);
