/* ============================================================
 * HOFLADEN – Vorbestellung und Voranmeldung (hofladen.html)
 * ============================================================
 * Lädt das Angebot von /api/hofladen/angebot, zeigt je offener Charge ein
 * Bestellformular und schickt Bestellungen bzw. Voranmeldungen an
 * /api/hofladen/bestellung und /api/hofladen/voranmeldung.
 * Keine Cookies, kein localStorage (siehe CLAUDE.md).
 *
 * Aufbau:
 *   1. Helfer (Formatierung, Escaping)
 *   2. Angebot anzeigen
 *   3. Bestellformular (Mengen, Summe, Termin, Absenden)
 *   4. Voranmeldung
 *   5. Start
 * ============================================================ */

'use strict';

/* ------------------------------------------------------------
   1. HELFER
   ------------------------------------------------------------ */
const hlEuro = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
const hlKg = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });
const hlKategorien = { fleisch: 'Fleisch', nudeln: 'Eiernudeln', honig: 'Honig', seife: 'Alpakaseife', saison: 'Saisonprodukte' };

const euro = (cent) => hlEuro.format(cent / 100);

function esc(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function datumLang(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function terminText(t) {
  const art = t.art === 'abholung' ? 'Abholung am Hof' : 'Lieferung zu euch';
  const zeit = t.von && t.bis ? `, ${t.von}–${t.bis} Uhr` : '';
  return `${art} – ${datumLang(t.datum)}${zeit}`;
}

// Schätzung je Stück bei Gewichtsware: Kilopreis × mittleres Richtgewicht
function schaetzungCent(a, menge) {
  if (a.art !== 'gewicht') return a.preisCent * menge;
  return Math.round((a.preisCent * menge * (a.richtVonG + a.richtBisG)) / 2000);
}

async function senden(pfad, daten) {
  let antwort;
  try {
    antwort = await fetch(`/api/hofladen/${pfad}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(daten),
    });
  } catch {
    throw new Error('Keine Verbindung – bitte später noch einmal versuchen oder anrufen: +43 664 2166181.');
  }
  const erg = await antwort.json().catch(() => ({}));
  if (!antwort.ok || !erg.ok) throw new Error(erg.error || 'Das hat leider nicht geklappt – bitte ruft uns an: +43 664 2166181.');
  return erg;
}

let hlAngebot = null;

/* ------------------------------------------------------------
   2. ANGEBOT ANZEIGEN
   ------------------------------------------------------------ */
function produktZeile(a) {
  const max = Math.min(a.frei, a.maxProBestellung || 99);
  const preis = a.art === 'gewicht'
    ? `${euro(a.preisCent)}/kg · ca. ${hlKg.format(a.richtVonG / 1000)}–${hlKg.format(a.richtBisG / 1000)} kg · ca. ${euro(schaetzungCent(a, 1))} je Stück`
    : euro(a.preisCent);
  const infos = [
    a.beschreibung && `<p>${esc(a.beschreibung)}</p>`,
    a.pflichtangaben && `<p>${esc(a.pflichtangaben)}</p>`,
    a.allergene && `<p><strong>Allergene: ${esc(a.allergene)}</strong></p>`,
  ].filter(Boolean).join('');
  const verfuegbar = a.frei > 0
    ? `noch ${a.frei} verfügbar${a.maxProBestellung ? ` · höchstens ${a.maxProBestellung} pro Bestellung` : ''}`
    : 'ausverkauft – <a href="#vormerken">für später vormerken</a>';

  return `<div class="hl-produkt${a.frei > 0 ? '' : ' hl-produkt--aus'}" data-artikel="${a.id}" data-max="${max}">
    <div class="hl-produkt-text">
      <strong>${esc(a.name)}</strong>
      <span class="hl-preis">${preis}</span>
      <span class="hl-frei">${verfuegbar}</span>
      ${infos ? `<details class="hl-angaben"><summary>Zutaten &amp; Angaben</summary>${infos}</details>` : ''}
    </div>
    <div class="hl-zaehler">
      <button type="button" data-schritt="-1" aria-label="${esc(a.name)}: weniger" ${a.frei > 0 ? '' : 'disabled'}>−</button>
      <output aria-live="polite" aria-label="Menge ${esc(a.name)}">0</output>
      <button type="button" data-schritt="1" aria-label="${esc(a.name)}: mehr" ${a.frei > 0 ? '' : 'disabled'}>+</button>
    </div>
  </div>`;
}

function chargeFormular(ch, liefergebiet) {
  const gruppen = Object.keys(hlKategorien)
    .map((kat) => [kat, ch.artikel.filter((a) => a.kategorie === kat)])
    .filter(([, liste]) => liste.length);
  const hatLieferung = ch.termine.some((t) => t.art === 'lieferung');

  return `<article class="hl-charge" id="charge-${ch.id}">
    <header class="hl-charge-kopf">
      <h3>${esc(ch.titel)}</h3>
      ${ch.beschreibung ? `<p>${esc(ch.beschreibung)}</p>` : ''}
      <p class="hl-schluss">Bestellschluss: ${datumLang(ch.bestellschluss)}</p>
    </header>
    <form class="hl-bestellung contact-form hl-formular" data-charge="${ch.id}" novalidate>
      <p style="display:none;" aria-hidden="true">
        <label>Nicht ausfüllen: <input name="bot-field" tabindex="-1" autocomplete="off" /></label>
      </p>
      ${gruppen.map(([kat, liste]) => `<div class="hl-kategorie"><h4>${hlKategorien[kat]}</h4>${liste.map(produktZeile).join('')}</div>`).join('')}

      <fieldset class="hl-feldgruppe">
        <legend>Abholung oder Lieferung</legend>
        ${ch.termine.map((t, i) => `<label class="hl-auswahl">
          <input type="radio" name="terminId" value="${t.id}" data-art="${t.art}" ${i === 0 ? 'checked' : ''} />
          <span>${esc(terminText(t))}${t.hinweis ? ` <small>(${esc(t.hinweis)})</small>` : ''}</span></label>`).join('')}
      </fieldset>

      ${hatLieferung ? `<div class="hl-adresse" hidden>
        <p class="form-hint">Kostenlose Lieferung nach ${liefergebiet.map((l) => esc(l.ort)).join(', ')}.</p>
        <div class="form-group"><label>Straße und Hausnummer<input name="strasse" autocomplete="street-address" /></label></div>
        <div class="hl-zweispaltig">
          <div class="form-group"><label>PLZ
            <select name="plz" autocomplete="postal-code"><option value="">bitte wählen</option>
              ${liefergebiet.map((l) => `<option value="${esc(l.plz)}" data-ort="${esc(l.ort)}">${esc(l.plz)} ${esc(l.ort)}</option>`).join('')}
            </select></label></div>
          <div class="form-group"><label>Ort<input name="ort" autocomplete="address-level2" /></label></div>
        </div>
      </div>` : ''}

      <div class="hl-zweispaltig">
        <div class="form-group"><label>Name<input name="name" autocomplete="name" required /></label></div>
        <div class="form-group"><label>Telefon<input name="telefon" type="tel" autocomplete="tel" required /></label></div>
      </div>
      <div class="form-group"><label>E-Mail <small>(für die Bestätigung)</small><input name="email" type="email" autocomplete="email" required /></label></div>

      <fieldset class="hl-feldgruppe">
        <legend>Bezahlung</legend>
        <label class="hl-auswahl"><input type="radio" name="zahlart" value="bar" checked /> <span>bar bei der Übergabe</span></label>
        <label class="hl-auswahl"><input type="radio" name="zahlart" value="ueberweisung" /> <span>Überweisung (Endbetrag und Bankdaten bekommt ihr bei der Übergabe)</span></label>
      </fieldset>

      <div class="form-group"><label>Anmerkung <small>(optional, z. B. „Gans lieber größer")</small><textarea name="anmerkung" rows="2"></textarea></label></div>

      <div class="hl-summe" aria-live="polite"><span>Summe</span><strong data-summe>€ 0,00</strong></div>
      <p class="form-hint" data-summe-hinweis hidden>Fleisch wird nach Gewicht abgerechnet – den genauen Betrag erfahrt ihr bei der Übergabe.</p>

      <label class="hl-zustimmung">
        <input type="checkbox" name="zustimmung" required />
        <span>Ich akzeptiere die <a href="#bedingungen">Bestellbedingungen</a> und habe die
          <a href="datenschutz.html#hofladen">Datenschutzerklärung</a> gelesen.</span>
      </label>
      <button type="submit" class="btn btn-primary hl-knopf-breit">Verbindlich vorbestellen</button>
      <p class="hl-meldung" role="status" aria-live="polite"></p>
    </form>
  </article>`;
}

function angebotZeigen(daten) {
  const ziel = document.getElementById('hl-angebot');
  if (!ziel) return;
  if (!daten.chargen.length) {
    ziel.innerHTML = `<div class="hl-leer">
      <p><strong>Gerade ist keine Vorbestellung offen.</strong></p>
      <p>Die nächste Charge kommt bestimmt – lasst euch gleich <a href="#vormerken">unverbindlich vormerken</a>,
        dann melden wir uns, sobald es so weit ist.</p></div>`;
    return;
  }
  ziel.innerHTML = daten.chargen.map((ch) => chargeFormular(ch, daten.liefergebiet)).join('');
  // Ist der vorausgewählte Termin eine Lieferung, gleich die Adressfelder zeigen
  ziel.querySelectorAll('.hl-bestellung').forEach(adresseUmschalten);
}

/* ------------------------------------------------------------
   3. BESTELLFORMULAR
   ------------------------------------------------------------ */
function chargeVonFormular(form) {
  return hlAngebot.chargen.find((c) => String(c.id) === form.dataset.charge);
}

function summeAktualisieren(form) {
  const ch = chargeVonFormular(form);
  let cent = 0;
  let geschaetzt = false;
  form.querySelectorAll('.hl-produkt').forEach((zeile) => {
    const menge = Number(zeile.querySelector('output').textContent);
    if (!menge) return;
    const a = ch.artikel.find((x) => String(x.id) === zeile.dataset.artikel);
    cent += schaetzungCent(a, menge);
    if (a.art === 'gewicht') geschaetzt = true;
  });
  form.querySelector('[data-summe]').textContent = `${geschaetzt ? 'ca. ' : ''}${euro(cent)}`;
  form.querySelector('[data-summe-hinweis]').hidden = !geschaetzt;
}

function adresseUmschalten(form) {
  const termin = form.querySelector('input[name="terminId"]:checked');
  const adresse = form.querySelector('.hl-adresse');
  if (adresse) adresse.hidden = !termin || termin.dataset.art !== 'lieferung';
}

async function bestellungAbschicken(form) {
  const meldung = form.querySelector('.hl-meldung');
  const feld = (name) => form.elements.namedItem(name);
  const positionen = [...form.querySelectorAll('.hl-produkt')]
    .map((zeile) => ({ artikelId: Number(zeile.dataset.artikel), menge: Number(zeile.querySelector('output').textContent) }))
    .filter((p) => p.menge > 0);
  const termin = form.querySelector('input[name="terminId"]:checked');

  const fehler = !positionen.length ? 'Bitte wählt mindestens ein Produkt aus.'
    : !feld('name').value.trim() ? 'Bitte euren Namen eintragen.'
    : !feld('telefon').value.trim() ? 'Bitte eine Telefonnummer eintragen.'
    : !feld('email').value.trim() ? 'Bitte eine E-Mail-Adresse eintragen.'
    : termin && termin.dataset.art === 'lieferung' && (!feld('strasse').value.trim() || !feld('plz').value || !feld('ort').value.trim())
      ? 'Bitte die Lieferadresse vollständig eintragen.'
    : !feld('zustimmung').checked ? 'Bitte bestätigt die Bestellbedingungen und die Datenschutzerklärung.'
    : '';
  if (fehler) {
    meldung.textContent = fehler;
    meldung.className = 'hl-meldung hl-meldung--fehler';
    return;
  }

  const knopf = form.querySelector('button[type="submit"]');
  knopf.disabled = true;
  meldung.textContent = 'Wird gesendet …';
  meldung.className = 'hl-meldung';
  try {
    const erg = await senden('bestellung', {
      chargeId: Number(form.dataset.charge),
      terminId: termin ? Number(termin.value) : null,
      name: feld('name').value, telefon: feld('telefon').value, email: feld('email').value,
      strasse: feld('strasse') ? feld('strasse').value : '',
      plz: feld('plz') ? feld('plz').value : '',
      ort: feld('ort') ? feld('ort').value : '',
      zahlart: form.querySelector('input[name="zahlart"]:checked').value,
      anmerkung: feld('anmerkung').value,
      zustimmung: feld('zustimmung').checked,
      positionen,
      'bot-field': feld('bot-field').value,
    });
    const warteliste = erg.status === 'warteliste';
    form.outerHTML = `<div class="hl-erfolg" tabindex="-1">
      <h4>${warteliste ? 'Ihr steht auf der Warteliste' : 'Danke – eure Vorbestellung ist fix!'}</h4>
      ${erg.nummer ? `<p>Bestellnummer <strong>${esc(erg.nummer)}</strong>. Die Bestätigung ist per E-Mail unterwegs.</p>` : ''}
      ${warteliste ? '<p>Die gewünschte Menge ist gerade nicht mehr frei. Sobald etwas frei wird, melden wir uns.</p>' : ''}
      ${erg.link ? `<p><a class="btn btn-primary" href="${esc(erg.link)}">Meine Bestellungen ansehen</a></p>
        <p class="form-hint">Den Link findet ihr auch in der E-Mail – bitte nicht weitergeben.</p>` : ''}
    </div>`;
  } catch (f) {
    meldung.textContent = f.message;
    meldung.className = 'hl-meldung hl-meldung--fehler';
    knopf.disabled = false;
  }
}

function initBestellung() {
  const bereich = document.getElementById('hl-angebot');
  if (!bereich) return;

  bereich.addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-schritt]');
    if (!knopf) return;
    const zeile = knopf.closest('.hl-produkt');
    const ausgabe = zeile.querySelector('output');
    const neu = Math.min(Number(zeile.dataset.max), Math.max(0, Number(ausgabe.textContent) + Number(knopf.dataset.schritt)));
    ausgabe.textContent = String(neu);
    zeile.classList.toggle('hl-produkt--gewaehlt', neu > 0);
    summeAktualisieren(knopf.closest('form'));
  });

  bereich.addEventListener('change', (e) => {
    const form = e.target.closest('form');
    if (!form) return;
    if (e.target.name === 'terminId') adresseUmschalten(form);
    if (e.target.name === 'plz') {
      const option = e.target.selectedOptions[0];
      const ort = form.elements.namedItem('ort');
      if (option && option.dataset.ort && ort) ort.value = option.dataset.ort;
    }
  });

  bereich.addEventListener('submit', (e) => {
    if (!e.target.classList.contains('hl-bestellung')) return;
    e.preventDefault();
    bestellungAbschicken(e.target);
  });
}

/* ------------------------------------------------------------
   4. VORANMELDUNG
   ------------------------------------------------------------ */
function voranmeldungVorbereiten(daten) {
  const form = document.getElementById('hl-voranmeldung');
  if (!form) return;
  const produkt = form.elements.namedItem('produktId');
  produkt.innerHTML = Object.keys(hlKategorien).map((kat) => {
    const liste = daten.produkte.filter((p) => p.kategorie === kat);
    return liste.length
      ? `<optgroup label="${hlKategorien[kat]}">${liste.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`
      : '';
  }).join('');
  form.elements.namedItem('zeitraum').innerHTML = Object.entries(daten.zeitraeume)
    .map(([wert, text]) => `<option value="${wert}">${esc(text)}</option>`).join('');
  const jahr = new Date().getFullYear();
  form.elements.namedItem('jahr').innerHTML = [jahr, jahr + 1].map((j) => `<option>${j}</option>`).join('');
}

function initVoranmeldung() {
  const form = document.getElementById('hl-voranmeldung');
  if (!form) return;
  const feld = (name) => form.elements.namedItem(name);

  form.addEventListener('change', (e) => {
    if (e.target.name === 'zeitraum') document.getElementById('va-jahr-feld').hidden = e.target.value === 'naechste';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const meldung = form.querySelector('.hl-meldung');
    const fehler = !feld('produktId').value ? 'Das Angebot wird noch geladen – bitte kurz warten.'
      : !feld('name').value.trim() ? 'Bitte euren Namen eintragen.'
      : !feld('telefon').value.trim() ? 'Bitte eine Telefonnummer eintragen.'
      : !feld('email').value.trim() ? 'Bitte eine E-Mail-Adresse eintragen.'
      : !feld('zustimmung').checked ? 'Bitte bestätigt die Datenschutzerklärung.'
      : '';
    if (fehler) {
      meldung.textContent = fehler;
      meldung.className = 'hl-meldung hl-meldung--fehler';
      return;
    }
    const knopf = form.querySelector('button[type="submit"]');
    knopf.disabled = true;
    meldung.textContent = 'Wird gesendet …';
    meldung.className = 'hl-meldung';
    try {
      const erg = await senden('voranmeldung', {
        produktId: Number(feld('produktId').value),
        menge: Number(feld('menge').value),
        zeitraum: feld('zeitraum').value,
        jahr: feld('zeitraum').value === 'naechste' ? null : Number(feld('jahr').value),
        name: feld('name').value, telefon: feld('telefon').value, email: feld('email').value,
        notiz: feld('notiz').value,
        zustimmung: feld('zustimmung').checked,
        'bot-field': feld('bot-field').value,
      });
      form.outerHTML = `<div class="hl-erfolg">
        <h4>Danke – ihr seid vorgemerkt!</h4>
        <p>Die Bestätigung ist per E-Mail unterwegs. Sobald die passende Charge feststeht, melden wir uns mit Preis und Termin.</p>
        ${erg.link ? `<p><a class="btn btn-primary" href="${esc(erg.link)}">Meine Bestellungen ansehen</a></p>` : ''}
      </div>`;
    } catch (f) {
      meldung.textContent = f.message;
      meldung.className = 'hl-meldung hl-meldung--fehler';
      knopf.disabled = false;
    }
  });
}

/* ------------------------------------------------------------
   5. START
   ------------------------------------------------------------ */
async function initAngebot() {
  const ziel = document.getElementById('hl-angebot');
  if (!ziel) return;
  try {
    const antwort = await fetch('/api/hofladen/angebot', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const daten = await antwort.json();
    if (!antwort.ok || !daten.ok) throw new Error(daten.error || 'Fehler');
    hlAngebot = daten;
    angebotZeigen(daten);
    voranmeldungVorbereiten(daten);
  } catch {
    ziel.innerHTML = `<div class="hl-leer"><p>Das Angebot kann gerade nicht geladen werden. Bitte später noch einmal
      versuchen – oder direkt anrufen: <a href="tel:+436642166181">+43 664 2166181</a>.</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initBestellung();
  initVoranmeldung();
  initAngebot();
});
