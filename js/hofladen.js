/* ============================================================
 * HOFLADEN – Vorbestellung und Voranmeldung (hofladen.html)
 * ============================================================
 * Lädt das Angebot von /api/hofladen/angebot, zeigt je offener Bestellrunde ein
 * Bestellformular, dazu das Dauersortiment („Immer erhältlich", ohne
 * Bestellschluss, Abholung nach Absprache), darunter das ganze Sortiment (was gerade bestellbar ist
 * und was man sich vormerken lassen kann), und schickt Bestellungen bzw.
 * Voranmeldungen an /api/hofladen/bestellung und /api/hofladen/voranmeldung.
 * Keine Cookies, kein localStorage (siehe CLAUDE.md).
 *
 * Aufbau:
 *   1. Helfer (Formatierung, Escaping)
 *   2. Angebot anzeigen
 *   3. Bestellformular (Mengen, Summe, Termin, Absenden)
 *   4. Voranmeldung
 *   4a. Sortiment
 *   4b. Vertrag widerrufen (§ 13a FAGG)
 *   4c. Fotos vergrößern
 *   5. Start
 * ============================================================ */

'use strict';

/* ------------------------------------------------------------
   1. HELFER
   ------------------------------------------------------------ */
const hlEuro = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
const hlKg = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });

const euro = (cent) => hlEuro.format(cent / 100);

function esc(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function datumLang(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Bestellschluss weit weg (z. B. Runde für Lagerware): „laufend bestellbar"
function tageBis(iso) {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`) - heute) / 86400000);
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

// Weitere Fotos eines Produkts (zur Beschreibung): einheitliche quadratische
// Vorschaubilder, Antippen vergrößert (4c). Liegen im zugeklappten Bereich
// „Angaben" – loading="lazy" lädt sie erst beim Aufklappen.
function fotoReihe(fotos, name) {
  if (!fotos || !fotos.length) return '';
  return `<div class="hl-fotos">${fotos.map((f, i) => `<button type="button" class="hl-foto" data-foto-gross="${esc(f)}"
      data-foto-text="${esc(name)}" aria-label="${esc(name)}: Foto ${i + 1} vergrößern">
      <img src="${esc(f)}" alt="${esc(name)} – Foto ${i + 1}" loading="lazy" decoding="async" /></button>`).join('')}</div>`;
}

// Aufklappbereich mit weiteren Fotos und Angaben; leer, wenn es nichts gibt
function angabenAufklappen(fotos, name, infos) {
  const mitFotos = fotos && fotos.length;
  if (!mitFotos && !infos) return '';
  const titel = mitFotos && infos ? 'Fotos, Zutaten &amp; Angaben' : mitFotos ? 'Weitere Fotos' : 'Zutaten &amp; Angaben';
  return `<details class="hl-angaben"><summary>${titel}</summary>${fotoReihe(fotos, name)}${infos}</details>`;
}

let hlAngebot = null;

// Liste nach Bereichen gruppieren (Reihenfolge wie in der Verwaltung);
// leere Bereiche entfallen. Liefert [[bereich, liste], …]
function nachBereichen(liste) {
  const bereiche = (hlAngebot && hlAngebot.bereiche) || [];
  const gruppen = bereiche.map((b) => [b, liste.filter((x) => x.bereichId === b.id)]);
  const ohne = liste.filter((x) => !bereiche.some((b) => b.id === x.bereichId));
  if (ohne.length) gruppen.push([{ id: null, name: 'Weitere Produkte' }, ohne]);
  return gruppen.filter(([, l]) => l.length);
}

/* ------------------------------------------------------------
   2. ANGEBOT ANZEIGEN
   ------------------------------------------------------------ */
// Dauersortiment: keine Menge, nur verfügbar/ausverkauft
const DAUER_MAX = 20;

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
  let verfuegbar;
  if (a.dauer) verfuegbar = a.frei > 0 ? 'vorrätig' : 'gerade ausverkauft – bald wieder da';
  else {
    verfuegbar = a.frei > 0
      ? `noch ${a.frei} verfügbar${a.maxProBestellung ? ` · höchstens ${a.maxProBestellung} pro Bestellung` : ''}`
      : 'ausverkauft – <a href="#vormerken">für später vormerken</a>';
  }

  return `<div class="hl-produkt${a.frei > 0 ? '' : ' hl-produkt--aus'}" data-artikel="${a.id}" data-max="${max}">
    <div class="hl-produkt-text">
      <strong>${esc(a.name)}</strong>
      <span class="hl-preis">${preis}</span>
      <span class="hl-frei">${verfuegbar}</span>
      ${angabenAufklappen(a.fotos, a.name, infos)}
    </div>
    <div class="hl-zaehler">
      <button type="button" data-schritt="-1" aria-label="${esc(a.name)}: weniger" ${a.frei > 0 ? '' : 'disabled'}>−</button>
      <output aria-live="polite" aria-label="Menge ${esc(a.name)}">0</output>
      <button type="button" data-schritt="1" aria-label="${esc(a.name)}: mehr" ${a.frei > 0 ? '' : 'disabled'}>+</button>
    </div>
  </div>`;
}

function chargeFormular(ch, liefergebiet) {
  const gruppen = nachBereichen(ch.artikel);
  const hatLieferung = ch.termine.some((t) => t.art === 'lieferung');

  return `<article class="hl-charge${ch.dauer ? ' hl-charge--dauer' : ''}" id="charge-${ch.id}">
    <header class="hl-charge-kopf">
      <h3>${esc(ch.titel)}</h3>
      ${ch.beschreibung ? `<p>${esc(ch.beschreibung)}</p>` : ''}
      <p class="hl-schluss">${ch.dauer || tageBis(ch.bestellschluss) > 60 ? 'Laufend bestellbar' : `Bestellschluss: ${datumLang(ch.bestellschluss)}`}</p>
    </header>
    <form class="hl-bestellung contact-form hl-formular" data-charge="${ch.id}" novalidate>
      <p style="display:none;" aria-hidden="true">
        <label>Nicht ausfüllen: <input name="bot-field" tabindex="-1" autocomplete="off" /></label>
      </p>
      ${gruppen.map(([b, liste]) => `<div class="hl-kategorie"><h4>${esc(b.name)}</h4>${liste.map(produktZeile).join('')}</div>`).join('')}

      ${ch.dauer ? `<fieldset class="hl-feldgruppe">
        <legend>Abholung</legend>
        <p class="form-hint">Abholung am Hof nach Absprache – wir melden uns, sobald alles für euch bereitliegt.</p>
      </fieldset>` : `<fieldset class="hl-feldgruppe">
        <legend>Abholung oder Lieferung</legend>
        ${ch.termine.map((t, i) => `<label class="hl-auswahl">
          <input type="radio" name="terminId" value="${t.id}" data-art="${t.art}" ${i === 0 ? 'checked' : ''} />
          <span>${esc(terminText(t))}${t.hinweis ? ` <small>(${esc(t.hinweis)})</small>` : ''}</span></label>`).join('')}
      </fieldset>`}

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
        <label class="hl-auswahl"><input type="radio" name="zahlart" value="ueberweisung" /> <span>${ch.dauer
          ? 'Überweisung (Bankdaten findet ihr unter „Meine Bestellungen")'
          : 'Überweisung (Endbetrag und Bankdaten bekommt ihr bei der Übergabe)'}</span></label>
      </fieldset>

      <div class="form-group"><label>Anmerkung <small>(optional, ${ch.dauer ? 'z. B. „Abholung am liebsten samstags"' : 'z. B. „Gans lieber größer"'})</small><textarea name="anmerkung" rows="2"></textarea></label></div>

      <div class="hl-summe" aria-live="polite"><span>Summe</span><strong data-summe>€ 0,00</strong></div>
      <p class="form-hint" data-summe-hinweis hidden>Fleisch wird nach Gewicht abgerechnet – den genauen Betrag erfahrt ihr bei der Übergabe.</p>

      <label class="hl-zustimmung">
        <input type="checkbox" name="zustimmung" required />
        <span>Ich akzeptiere die <a href="#bedingungen">Bestellbedingungen</a> und habe die
          <a href="datenschutz.html#hofladen">Datenschutzerklärung</a> gelesen.</span>
      </label>
      <button type="submit" class="btn btn-primary hl-knopf-breit">${ch.dauer ? 'Verbindlich bestellen' : 'Verbindlich vorbestellen'}</button>
      <p class="hl-meldung" role="status" aria-live="polite"></p>
    </form>
  </article>`;
}

// Dauersortiment als „Bestellrunde" ohne Termine, Menge und Bestellschluss
function dauerAlsCharge(dauer) {
  return {
    id: dauer.id,
    dauer: true,
    titel: 'Immer erhältlich',
    beschreibung: 'Nudeln, Seife und mehr – ohne Bestellschluss. Ihr holt eure Bestellung nach Absprache am Hof ab.',
    termine: [],
    artikel: dauer.artikel.map((a) => ({ ...a, dauer: true, frei: a.verfuegbar ? DAUER_MAX : 0, maxProBestellung: null })),
  };
}

// Alle bestellbaren „Runden" der Seite: Bestellrunden und Dauersortiment
const alleChargen = (daten) => daten.chargen.concat(daten.dauer ? [dauerAlsCharge(daten.dauer)] : []);

function angebotZeigen(daten) {
  const ziel = document.getElementById('hl-angebot');
  if (!ziel) return;
  const leer = !daten.chargen.length ? `<div class="hl-leer">
      <p><strong>Gerade ist keine Bestellrunde offen.</strong></p>
      <p>Die nächste Bestellrunde kommt bestimmt – lasst euch gleich <a href="#vormerken">unverbindlich vormerken</a>,
        dann melden wir uns, sobald es so weit ist.</p></div>` : '';
  ziel.innerHTML = leer + alleChargen(daten).map((ch) => chargeFormular(ch, daten.liefergebiet)).join('');
  // Ist der vorausgewählte Termin eine Lieferung, gleich die Adressfelder zeigen
  ziel.querySelectorAll('.hl-bestellung').forEach(adresseUmschalten);
}

/* ------------------------------------------------------------
   3. BESTELLFORMULAR
   ------------------------------------------------------------ */
function chargeVonFormular(form) {
  return alleChargen(hlAngebot).find((c) => String(c.id) === form.dataset.charge);
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
    const dauer = chargeVonFormular(form).dauer;
    form.outerHTML = `<div class="hl-erfolg" tabindex="-1">
      <h4>${warteliste ? 'Ihr steht auf der Warteliste' : `Danke – eure ${dauer ? 'Bestellung' : 'Vorbestellung'} ist fix!`}</h4>
      ${dauer ? '<p>Wir melden uns, sobald alles für euch bereitliegt.</p>' : ''}
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
  produkt.innerHTML = nachBereichen(daten.produkte.filter((p) => !p.dauer)).map(([b, liste]) =>
    `<optgroup label="${esc(b.name)}">${liste.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
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
        <p>Die Bestätigung ist per E-Mail unterwegs. Sobald die passende Bestellrunde feststeht, melden wir uns mit Preis und Termin.</p>
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
   4a. SORTIMENT
   Alle eingeblendeten Produkte. Ist ein Produkt in einer offenen
   Bestellrunde, führt der Knopf zum Bestellformular, sonst zur
   Voranmeldung (Produkt ist dort schon ausgewählt).
   ------------------------------------------------------------ */
function sortimentKarte(p, daten) {
  const angebote = alleChargen(daten)
    .map((ch) => ({ ch, a: ch.artikel.find((x) => x.produktId === p.id) }))
    .filter((x) => x.a);
  const frei = angebote.find((x) => x.a.frei > 0);
  const gewicht = p.art === 'gewicht' && p.richtVonG
    ? `<span class="hl-sortiment-gewicht">ca. ${hlKg.format(p.richtVonG / 1000)}–${hlKg.format(p.richtBisG / 1000)} kg je Stück</span>` : '';
  const infos = [
    p.pflichtangaben && `<p>${esc(p.pflichtangaben)}</p>`,
    p.allergene && `<p><strong>Allergene: ${esc(p.allergene)}</strong></p>`,
  ].filter(Boolean).join('');

  let stand;
  if (p.dauer && !frei) {
    stand = '<p class="hl-sortiment-stand">Gerade ausverkauft – bald wieder da</p>';
  } else if (frei) {
    const preis = frei.a.art === 'gewicht' ? `${euro(frei.a.preisCent)}/kg` : euro(frei.a.preisCent);
    stand = `<p class="hl-sortiment-stand hl-sortiment-stand--da">${frei.ch.dauer ? 'Immer erhältlich' : 'Jetzt bestellbar'} · ${preis}</p>
      <a class="btn btn-primary hl-sortiment-knopf" href="#charge-${frei.ch.id}">Zur Bestellung</a>`;
  } else {
    stand = `<p class="hl-sortiment-stand">${angebote.length ? 'Gerade ausverkauft' : 'Derzeit nicht vorrätig'}</p>
      <button type="button" class="btn btn-outline hl-sortiment-knopf" data-vormerken="${p.id}">Vormerken lassen</button>`;
  }

  return `<article class="hl-sortiment-karte">
    ${p.bild ? `<img src="${esc(p.bild)}" alt="${esc(p.name)}" loading="lazy" decoding="async" />` : ''}
    <div class="hl-sortiment-text">
      <h4>${esc(p.name)}</h4>
      ${gewicht}
      ${p.beschreibung ? `<p>${esc(p.beschreibung)}</p>` : ''}
      ${angabenAufklappen(p.fotos, p.name, infos)}
    </div>
    <div class="hl-sortiment-fuss">${stand}</div>
  </article>`;
}

function sortimentZeigen(daten) {
  const bereich = document.getElementById('sortiment');
  const ziel = document.getElementById('hl-sortiment');
  if (!bereich || !ziel || !daten.produkte.length) return;
  ziel.innerHTML = nachBereichen(daten.produkte).map(([b, liste]) => `<div class="hl-kategorie"><h3>${esc(b.name)}</h3>
    <div class="hl-sortiment-raster">${liste.map((p) => sortimentKarte(p, daten)).join('')}</div></div>`).join('');
  bereich.hidden = false;
}

function initSortiment() {
  const ziel = document.getElementById('hl-sortiment');
  if (!ziel) return;
  ziel.addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-vormerken]');
    if (!knopf) return;
    const form = document.getElementById('hl-voranmeldung');
    if (!form) return;
    form.elements.namedItem('produktId').value = knopf.dataset.vormerken;
    document.getElementById('vormerken').scrollIntoView({ behavior: 'smooth' });
    form.elements.namedItem('menge').focus({ preventScroll: true });
  });
}

/* ------------------------------------------------------------
   4b. VERTRAG WIDERRUFEN (§ 13a FAGG)
   Erst der Knopf „Vertrag widerrufen", dann Angaben und „Widerruf
   bestätigen". Die Eingangsbestätigung mit Zeitpunkt erscheint hier und
   kommt zusätzlich per E-Mail.
   ------------------------------------------------------------ */
function initWiderruf() {
  const form = document.getElementById('hl-widerruf');
  const knopf = document.querySelector('.hl-widerruf-knopf');
  if (!form || !knopf) return;
  const feld = (name) => form.elements.namedItem(name);

  knopf.addEventListener('click', () => {
    form.hidden = false;
    knopf.setAttribute('aria-expanded', 'true');
    feld('name').focus();
  });

  form.addEventListener('change', (e) => {
    if (e.target.name === 'umfang') form.querySelector('[data-produkte]').hidden = e.target.value !== 'teil';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const meldung = form.querySelector('.hl-meldung');
    const umfang = form.querySelector('input[name="umfang"]:checked').value;
    const fehler = !feld('name').value.trim() ? 'Bitte euren Namen eintragen.'
      : !feld('bestellnummer').value.trim() ? 'Bitte die Bestellnummer eintragen.'
      : !feld('email').value.trim() ? 'Bitte die E-Mail-Adresse eintragen.'
      : umfang === 'teil' && !feld('produkte').value.trim() ? 'Bitte angeben, welche Produkte ihr widerrufen wollt.'
      : '';
    if (fehler) {
      meldung.textContent = fehler;
      meldung.className = 'hl-meldung hl-meldung--fehler';
      return;
    }
    const absenden = form.querySelector('button[type="submit"]');
    absenden.disabled = true;
    meldung.textContent = 'Wird gesendet …';
    meldung.className = 'hl-meldung';
    try {
      const erg = await senden('widerruf', {
        name: feld('name').value, email: feld('email').value, bestellnummer: feld('bestellnummer').value,
        umfang, produkte: feld('produkte').value, 'bot-field': feld('bot-field').value,
      });
      knopf.hidden = true;
      form.outerHTML = `<div class="hl-widerruf-bestaetigt" tabindex="-1">
        <h3>Euer Widerruf ist eingegangen</h3>
        <p>Bestellnummer <strong>${esc(erg.nummer)}</strong> · widerrufen: <strong>${esc(erg.umfang)}</strong><br>
          Eingegangen am ${esc(erg.eingegangen)} Uhr.</p>
        <p>Die Bestätigung ist per E-Mail unterwegs. Wir melden uns zur Abwicklung.</p>
      </div>`;
    } catch (f) {
      meldung.textContent = f.message;
      meldung.className = 'hl-meldung hl-meldung--fehler';
      absenden.disabled = false;
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
    sortimentZeigen(daten);
  } catch {
    ziel.innerHTML = `<div class="hl-leer"><p>Das Angebot kann gerade nicht geladen werden. Bitte später noch einmal
      versuchen – oder direkt anrufen: <a href="tel:+436642166181">+43 664 2166181</a>.</p></div>`;
  }
}

/* ------------------------------------------------------------
   4c. FOTOS VERGRÖSSERN
   Ein <dialog> für alle Fotos: Esc und Tippen daneben schließen.
   ------------------------------------------------------------ */
function initFotoGross() {
  let dialog = null;
  document.addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-foto-gross]');
    if (!knopf) return;
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'hl-foto-dialog';
      dialog.innerHTML = `<button type="button" class="hl-foto-zu" aria-label="Foto schließen">×</button>
        <img alt="" decoding="async" /><p class="hl-foto-text"></p>`;
      dialog.addEventListener('click', (ev) => {
        if (ev.target === dialog || ev.target.closest('.hl-foto-zu')) dialog.close();
      });
      dialog.addEventListener('close', () => { dialog.querySelector('img').removeAttribute('src'); });
      document.body.appendChild(dialog);
    }
    const bild = dialog.querySelector('img');
    bild.src = knopf.dataset.fotoGross;
    bild.alt = knopf.querySelector('img')?.alt || '';
    dialog.querySelector('.hl-foto-text').textContent = knopf.dataset.fotoText || '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else window.open(knopf.dataset.fotoGross, '_blank', 'noopener');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initFotoGross();
  initBestellung();
  initVoranmeldung();
  initSortiment();
  initWiderruf();
  initAngebot();
});
