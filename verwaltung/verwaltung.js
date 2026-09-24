/* ============================================================
 * HOFLADEN-VERWALTUNG – Entwurf
 * ============================================================
 * Anklickbarer Entwurf der Verwaltung für Vorbestellungen
 * (Plan: docs/HOFLADEN-VORBESTELLUNG.md, Abschnitt 7).
 *
 * Arbeitet nur mit den Beispieldaten aus entwurf-daten.js im
 * Arbeitsspeicher – bewusst ohne localStorage (siehe CLAUDE.md).
 * In der fertigen Lösung ersetzen Aufrufe an /api/verwaltung/…
 * die Funktionen in Abschnitt 3.
 *
 * Ansichten (Adresse hinter #):
 *   uebersicht · bestellungen · neu · wiegen · uebergabe · zahlungen
 * ============================================================ */

'use strict';

/* ------------------------------------------------------------
   1. ZUSTAND
   ------------------------------------------------------------ */
const daten = JSON.parse(JSON.stringify(ENTWURF_DATEN));
const zustand = {
  chargeId: daten.chargen[0].id,
  filter: 'alle',
  suche: '',
  uebergabeArt: 'abholung',
};

/* ------------------------------------------------------------
   2. HELFER (Formatierung, Escaping)
   ------------------------------------------------------------ */
const euroFormat = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
const kgFormat = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const euro = (cent) => euroFormat.format(cent / 100);
const kg = (g) => `${kgFormat.format(g / 1000)} kg`;

function esc(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function datumKurz(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short', day: 'numeric', month: 'numeric',
  });
}

function tageBis(iso) {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`) - heute) / 86400000);
}

function uhrzeit(hhmm) {
  return hhmm.endsWith(':00') ? String(Number(hhmm.slice(0, 2))) : hhmm;
}

function terminText(t) {
  const art = t.art === 'abholung' ? 'Abholung' : 'Lieferung';
  return `${art} ${datumKurz(t.datum)}, ${uhrzeit(t.von)}–${uhrzeit(t.bis)} Uhr`;
}

const QUELLEN = { web: 'Website', whatsapp: 'WhatsApp', telefon: 'Telefon', persoenlich: 'persönlich' };
const ZAHLARTEN = { bar: 'bar', ueberweisung: 'Überweisung' };

/* ------------------------------------------------------------
   3. DATEN UND BERECHNUNGEN
   ------------------------------------------------------------ */
const aktiveCharge = () => daten.chargen.find((c) => c.id === zustand.chargeId);
const chargeVon = (b) => daten.chargen.find((c) => c.id === b.chargeId);
const kundeVon = (b) => daten.kunden.find((k) => k.id === b.kundeId);
const artikelVon = (ch, id) => ch.artikel.find((a) => a.id === id);
const terminVon = (b) => chargeVon(b).termine.find((t) => t.id === b.terminId);
const bestellungVon = (id) => daten.bestellungen.find((b) => b.id === id);

const bestellungenDerCharge = (ch = aktiveCharge()) =>
  daten.bestellungen.filter((b) => b.chargeId === ch.id);

const istAktiv = (b) => b.status === 'vorgemerkt';

function bestellteMenge(ch, artikelId) {
  return bestellungenDerCharge(ch)
    .filter(istAktiv)
    .reduce((summe, b) => summe + b.positionen
      .filter((p) => p.artikelId === artikelId)
      .reduce((s, p) => s + p.menge, 0), 0);
}

function freieMenge(ch, artikelId) {
  return artikelVon(ch, artikelId).kontingent - bestellteMenge(ch, artikelId);
}

// Gewichtsware ohne Gewicht wird mit dem mittleren Richtgewicht geschätzt.
function positionBetrag(ch, pos) {
  const a = artikelVon(ch, pos.artikelId);
  if (a.art !== 'gewicht') return { cent: a.preisCent * pos.menge, geschaetzt: false };
  if (pos.gewichtG) return { cent: Math.round((a.preisCent * pos.gewichtG) / 1000), geschaetzt: false };
  const mittelG = (a.richtVonG + a.richtBisG) / 2;
  return { cent: Math.round((a.preisCent * mittelG * pos.menge) / 1000), geschaetzt: true };
}

function bestellBetrag(b) {
  const ch = chargeVon(b);
  return b.positionen.reduce((erg, pos) => {
    const p = positionBetrag(ch, pos);
    return { cent: erg.cent + p.cent, geschaetzt: erg.geschaetzt || p.geschaetzt };
  }, { cent: 0, geschaetzt: false });
}

function betragText({ cent, geschaetzt }) {
  return geschaetzt ? `ca. ${euro(cent)}` : euro(cent);
}

function artikelKurz(b) {
  const ch = chargeVon(b);
  return b.positionen
    .map((p) => `${p.menge}× ${artikelVon(ch, p.artikelId).name}`)
    .join(' · ');
}

function naechsteNummer() {
  const hoechste = daten.bestellungen
    .map((b) => Number(b.nummer.split('-')[1]))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${new Date().getFullYear()}-${String(hoechste + 1).padStart(3, '0')}`;
}

function gewichtsPositionen(ch = aktiveCharge()) {
  const liste = [];
  bestellungenDerCharge(ch).filter(istAktiv).forEach((b) => {
    b.positionen.forEach((p, index) => {
      if (artikelVon(ch, p.artikelId).art === 'gewicht') liste.push({ b, p, index });
    });
  });
  return liste.sort((x, y) => kundeVon(x.b).name.localeCompare(kundeVon(y.b).name, 'de'));
}

/* ------------------------------------------------------------
   4. BAUSTEINE (wiederkehrende HTML-Teile)
   ------------------------------------------------------------ */
function chargeWahl() {
  return `<div class="vw-chips" role="group" aria-label="Charge wählen">${daten.chargen
    .map((c) => `<button type="button" class="vw-chip" data-aktion="charge" data-id="${c.id}"
      aria-pressed="${c.id === zustand.chargeId}">${esc(c.titel)}</button>`)
    .join('')}</div>`;
}

function marken(b) {
  const t = terminVon(b);
  const teile = [];
  if (b.status === 'warteliste') teile.push('<span class="vw-marke vw-marke--info">Warteliste</span>');
  if (b.status === 'storniert') teile.push('<span class="vw-marke">storniert</span>');
  teile.push(`<span class="vw-marke">${t.art === 'abholung' ? 'Abholung' : 'Lieferung'} ${datumKurz(t.datum)}</span>`);
  if (istAktiv(b)) {
    teile.push(b.bezahlt
      ? `<span class="vw-marke vw-marke--gut">bezahlt (${ZAHLARTEN[b.bezahlt]})</span>`
      : `<span class="vw-marke vw-marke--offen">offen · ${ZAHLARTEN[b.zahlart]}</span>`);
    if (b.uebergeben) teile.push('<span class="vw-marke vw-marke--gut">übergeben</span>');
  }
  return `<div class="vw-marken">${teile.join('')}</div>`;
}

function bestellZeile(b) {
  const k = kundeVon(b);
  const grau = !istAktiv(b) || b.uebergeben ? ' vw-zeile--grau' : '';
  return `<button type="button" class="vw-zeile${grau}" data-aktion="oeffnen" data-id="${b.id}">
    <span class="vw-zeile-name">${esc(k.name)}</span>
    <span class="vw-zeile-betrag">${betragText(bestellBetrag(b))}</span>
    <span class="vw-zeile-info">${esc(artikelKurz(b))}<br>${esc(b.nummer)} · ${esc(k.ort)} · ${QUELLEN[b.quelle]}</span>
    ${marken(b)}
  </button>`;
}

function whatsappLink(b, text) {
  const nummer = kundeVon(b).telefon.replace(/[^\d]/g, '');
  return `https://wa.me/${nummer}?text=${encodeURIComponent(text)}`;
}

function bereitText(b) {
  const k = kundeVon(b);
  const t = terminVon(b);
  const wann = t.art === 'abholung'
    ? `Ihr könnt sie am ${datumKurz(t.datum)} zwischen ${uhrzeit(t.von)} und ${uhrzeit(t.bis)} Uhr bei uns am Hof abholen.`
    : `Wir liefern am ${datumKurz(t.datum)} zwischen ${uhrzeit(t.von)} und ${uhrzeit(t.bis)} Uhr.`;
  return `Hallo ${k.name.split(' ')[0]}, eure Bestellung ${b.nummer} ist fertig: ${artikelKurz(b)}. `
    + `Betrag: ${betragText(bestellBetrag(b))}. ${wann} Liebe Grüße, Kathrin & Florian`;
}

// Ankündigung einer Charge – zum Weiterleiten in WhatsApp-Kanal,
// Übertragungsliste oder Gruppe. Der Link zeigt später auf hofladen.html.
function ankuendigungText(ch) {
  const artikel = ch.artikel.map((a) => {
    const preis = a.art === 'gewicht' ? `${euro(a.preisCent)}/kg` : euro(a.preisCent);
    return `• ${a.name} – ${preis}`;
  }).join('\n');
  const termine = ch.termine.map((t) => `• ${terminText(t)}`).join('\n');
  return `Neu vom Hof Kruckenhaus: ${ch.titel}\n\n${artikel}\n\n${termine}\n\n`
    + `Bestellschluss: ${datumKurz(ch.bestellschluss)}\n`
    + 'Jetzt vorbestellen: https://www.kruckenhaus.at/hofladen.html\n\n'
    + 'Liebe Grüße, Kathrin & Florian';
}

function ankuendigungOeffnen() {
  const ch = aktiveCharge();
  const dialog = document.getElementById('vw-dialog');
  if (!dialog) return;
  const text = ankuendigungText(ch);
  dialog.innerHTML = `<div class="vw-dialog-inhalt">
    <div class="vw-dialog-kopf">
      <h2 id="vw-dialog-titel">Ankündigung für WhatsApp</h2>
      <button type="button" class="vw-schliessen" data-aktion="schliessen" aria-label="Schließen">×</button>
    </div>
    <p class="vw-klein">Text prüfen, dann in WhatsApp öffnen und dort Kanal, Übertragungsliste oder Gruppe auswählen.</p>
    <label class="vw-feld"><span>Text</span>
      <textarea id="vw-ankuendigung" rows="12">${esc(text)}</textarea></label>
    <div class="vw-knopfreihe">
      <button type="button" class="vw-knopf vw-knopf--voll" data-aktion="ankuendigung-whatsapp">In WhatsApp öffnen</button>
      <button type="button" class="vw-knopf" data-aktion="ankuendigung-kopieren">Text kopieren</button>
    </div>
  </div>`;
  delete dialog.dataset.id;
  if (!dialog.open) dialog.showModal();
}

function navLink(b) {
  const k = kundeVon(b);
  const ziel = encodeURIComponent(`${k.strasse}, ${k.plz} ${k.ort}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${ziel}`;
}

/* ------------------------------------------------------------
   5. ANSICHTEN
   ------------------------------------------------------------ */
const inhalt = () => document.getElementById('vw-inhalt');

// 5.1 Übersicht
function ansichtUebersicht() {
  const ch = aktiveCharge();
  const alle = bestellungenDerCharge(ch);
  const aktiv = alle.filter(istAktiv);
  const warteliste = alle.filter((b) => b.status === 'warteliste');
  const offen = aktiv.filter((b) => !b.bezahlt);
  const offenCent = offen.reduce((s, b) => s + bestellBetrag(b).cent, 0);
  const nichtUebergeben = aktiv.filter((b) => !b.uebergeben).length;
  const ungewogen = gewichtsPositionen(ch).filter((x) => !x.p.gewichtG).length;
  const tage = tageBis(ch.bestellschluss);
  const schlussText = tage > 1 ? `in ${tage} Tagen` : tage === 1 ? 'morgen' : tage === 0 ? 'heute' : 'vorbei';

  const artikelHtml = ch.artikel.map((a) => {
    const bestellt = bestellteMenge(ch, a.id);
    const anteil = Math.min(100, Math.round((bestellt / a.kontingent) * 100));
    const preis = a.art === 'gewicht' ? `${euro(a.preisCent)}/kg` : euro(a.preisCent);
    const frei = a.kontingent - bestellt;
    return `<div class="vw-artikel-zeile">
      <div class="vw-zeile-kopf"><strong>${esc(a.name)}</strong><span class="vw-klein">${preis}</span></div>
      <div class="vw-balken${frei <= 0 ? ' vw-balken--voll' : ''}"><span style="width:${anteil}%"></span></div>
      <div class="vw-zeile-kopf vw-klein"><span>${bestellt} von ${a.kontingent} bestellt</span>
        <span>${frei > 0 ? `noch ${frei} frei` : 'ausverkauft'}</span></div>
    </div>`;
  }).join('');

  const aufgaben = [];
  if (warteliste.length) aufgaben.push(`<li><button type="button" data-aktion="filter" data-wert="warteliste">${warteliste.length} auf der Warteliste <span class="vw-pfeil">›</span></button></li>`);
  if (ungewogen) aufgaben.push(`<li><a href="#wiegen">${ungewogen} Positionen noch nicht gewogen <span class="vw-pfeil">›</span></a></li>`);
  if (nichtUebergeben) aufgaben.push(`<li><a href="#uebergabe">${nichtUebergeben} Bestellungen noch nicht übergeben <span class="vw-pfeil">›</span></a></li>`);
  if (offen.length) aufgaben.push(`<li><a href="#zahlungen">${offen.length} Bestellungen noch nicht bezahlt <span class="vw-pfeil">›</span></a></li>`);
  aufgaben.push('<li><button type="button" data-aktion="ankuendigung">Ankündigung für WhatsApp <span class="vw-pfeil">›</span></button></li>');
  aufgaben.push('<li><button type="button" data-aktion="drucken">Packzettel drucken <span class="vw-pfeil">›</span></button></li>');
  aufgaben.push('<li><button type="button" data-aktion="export">Liste für Excel herunterladen <span class="vw-pfeil">›</span></button></li>');

  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Übersicht</h1>${chargeWahl()}</div>
    <div class="vw-kennzahlen">
      <div class="vw-kennzahl"><strong>${aktiv.length}</strong><span>Bestellungen${warteliste.length ? ` · ${warteliste.length} Warteliste` : ''}</span></div>
      <div class="vw-kennzahl${offenCent ? ' vw-kennzahl--achtung' : ''}"><strong>${euro(offenCent)}</strong><span>noch offen${ungewogen ? ' (teils geschätzt)' : ''}</span></div>
      <div class="vw-kennzahl"><strong>${nichtUebergeben}</strong><span>noch zu übergeben</span></div>
      <div class="vw-kennzahl${tage >= 0 && tage <= 3 ? ' vw-kennzahl--achtung' : ''}"><strong>${schlussText}</strong><span>Bestellschluss ${datumKurz(ch.bestellschluss)}</span></div>
    </div>
    <div class="vw-spalten">
      <section class="vw-karte" aria-label="Artikel"><h2>Was ist bestellt?</h2>${artikelHtml}</section>
      <div>
        <section class="vw-karte" aria-label="Zu erledigen"><h2>Zu erledigen</h2><ul class="vw-aufgaben">${aufgaben.join('')}</ul></section>
        <section class="vw-karte" aria-label="Termine"><h2>Termine</h2>
          ${ch.termine.map((t) => `<p>${terminText(t)}</p>`).join('')}
        </section>
      </div>
    </div>`;
}

// 5.2 Bestellungen
const FILTER = [
  ['alle', 'Alle'],
  ['abholung', 'Abholung'],
  ['lieferung', 'Lieferung'],
  ['offen', 'Nicht bezahlt'],
  ['warteliste', 'Warteliste'],
  ['storniert', 'Storniert'],
];

function passtZumFilter(b) {
  switch (zustand.filter) {
    case 'abholung':
    case 'lieferung': return istAktiv(b) && terminVon(b).art === zustand.filter;
    case 'offen': return istAktiv(b) && !b.bezahlt;
    case 'warteliste': return b.status === 'warteliste';
    case 'storniert': return b.status === 'storniert';
    default: return b.status !== 'storniert';
  }
}

function ansichtBestellungen() {
  const ch = aktiveCharge();
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Bestellungen</h1>${chargeWahl()}
      <input type="search" class="vw-suche" id="vw-suche" placeholder="Name, Ort oder Nummer suchen …"
        aria-label="Bestellungen durchsuchen" value="${esc(zustand.suche)}" />
      <div class="vw-chips" role="group" aria-label="Filter">${FILTER.map(([wert, text]) =>
        `<button type="button" class="vw-chip" data-aktion="filter" data-wert="${wert}"
          aria-pressed="${zustand.filter === wert}">${text}</button>`).join('')}</div>
      <p class="vw-summen">Bestellt: ${ch.artikel.map((a) => `${bestellteMenge(ch, a.id)}× ${esc(a.name)}`).join(' · ')}</p>
    </div>
    <div class="vw-liste" id="vw-liste"></div>`;
  listeAktualisieren();
}

function listeAktualisieren() {
  const liste = document.getElementById('vw-liste');
  if (!liste) return;
  const suche = zustand.suche.trim().toLowerCase();
  const treffer = bestellungenDerCharge()
    .filter(passtZumFilter)
    .filter((b) => {
      if (!suche) return true;
      const k = kundeVon(b);
      return `${k.name} ${k.ort} ${b.nummer} ${k.telefon}`.toLowerCase().includes(suche);
    })
    .sort((x, y) => kundeVon(x).name.localeCompare(kundeVon(y).name, 'de'));
  liste.innerHTML = treffer.length
    ? treffer.map(bestellZeile).join('')
    : '<p class="vw-klein">Keine Bestellungen gefunden.</p>';
}

// 5.3 Bestellung erfassen (Telefon, WhatsApp, persönlich)
function ansichtNeu() {
  const ch = aktiveCharge();
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Bestellung erfassen</h1>
      <p class="vw-klein">Für Bestellungen per Telefon, WhatsApp oder persönlich. Zählt genauso vom Kontingent ab wie eine Bestellung über die Website.</p>
      ${chargeWahl()}</div>
    <form class="vw-karte" id="vw-formular" novalidate>
      <fieldset class="vw-feldgruppe"><legend>Wie kam die Bestellung?</legend>
        <div class="vw-auswahl vw-auswahl--reihe">
          <label><input type="radio" name="quelle" value="whatsapp" checked /> WhatsApp</label>
          <label><input type="radio" name="quelle" value="telefon" /> Telefon</label>
          <label><input type="radio" name="quelle" value="persoenlich" /> persönlich</label>
        </div>
      </fieldset>

      <label class="vw-feld"><span>Name</span>
        <input name="name" list="vw-kundenliste" autocomplete="off" required placeholder="Name eintippen – bekannte Kunden werden vorgeschlagen" />
      </label>
      <datalist id="vw-kundenliste">${daten.kunden.map((k) => `<option value="${esc(k.name)}">${esc(k.ort)}</option>`).join('')}</datalist>
      <label class="vw-feld"><span>Telefon</span><input name="telefon" type="tel" inputmode="tel" /></label>

      <fieldset class="vw-feldgruppe"><legend>Was?</legend>
        ${ch.artikel.map((a) => `
          <div class="vw-zaehler-zeile">
            <div><strong>${esc(a.name)}</strong><br>
              <span class="vw-klein">${a.art === 'gewicht' ? `${euro(a.preisCent)}/kg · ca. ${kgFormat.format(a.richtVonG / 1000)}–${kgFormat.format(a.richtBisG / 1000)} kg/Stück` : euro(a.preisCent)} · noch ${Math.max(0, freieMenge(ch, a.id))} frei</span></div>
            <div class="vw-zaehler">
              <button type="button" data-aktion="minus" data-id="${a.id}" aria-label="${esc(a.name)} weniger">−</button>
              <output id="menge-${a.id}" data-artikel="${a.id}">0</output>
              <button type="button" data-aktion="plus" data-id="${a.id}" aria-label="${esc(a.name)} mehr">+</button>
            </div>
          </div>`).join('')}
      </fieldset>

      <fieldset class="vw-feldgruppe"><legend>Abholung oder Lieferung?</legend>
        <div class="vw-auswahl">${ch.termine.map((t, i) => `
          <label><input type="radio" name="termin" value="${t.id}" data-art="${t.art}" ${i === 0 ? 'checked' : ''} /> ${terminText(t)}</label>`).join('')}
        </div>
      </fieldset>

      <div id="vw-adresse">
        <label class="vw-feld"><span>Straße und Hausnummer</span><input name="strasse" autocomplete="off" /></label>
        <label class="vw-feld"><span>Ort</span><input name="ort" autocomplete="off" /></label>
      </div>

      <fieldset class="vw-feldgruppe"><legend>Zahlung</legend>
        <div class="vw-auswahl vw-auswahl--reihe">
          <label><input type="radio" name="zahlart" value="bar" checked /> bar</label>
          <label><input type="radio" name="zahlart" value="ueberweisung" /> Überweisung</label>
        </div>
      </fieldset>

      <label class="vw-feld"><span>Anmerkung (optional)</span><textarea name="anmerkung" rows="2"></textarea></label>

      <div class="vw-gesamt"><span>Summe</span><span id="vw-summe">0,00 €</span></div>
      <button type="submit" class="vw-knopf vw-knopf--voll vw-knopf--breit">Bestellung speichern</button>
    </form>`;
  adresseUmschalten();
}

function formularMengen() {
  const mengen = {};
  document.querySelectorAll('#vw-formular output[data-artikel]').forEach((o) => {
    mengen[o.dataset.artikel] = Number(o.value || o.textContent);
  });
  return mengen;
}

function formularSummeAktualisieren() {
  const ch = aktiveCharge();
  const mengen = formularMengen();
  const erg = Object.entries(mengen)
    .filter(([, m]) => m > 0)
    .reduce((s, [artikelId, menge]) => {
      const p = positionBetrag(ch, { artikelId, menge });
      return { cent: s.cent + p.cent, geschaetzt: s.geschaetzt || p.geschaetzt };
    }, { cent: 0, geschaetzt: false });
  const feld = document.getElementById('vw-summe');
  if (feld) feld.textContent = betragText(erg);
}

function adresseUmschalten() {
  const gewaehlt = document.querySelector('#vw-formular input[name="termin"]:checked');
  const adresse = document.getElementById('vw-adresse');
  if (!gewaehlt || !adresse) return;
  adresse.hidden = gewaehlt.dataset.art !== 'lieferung';
}

// form.name wäre der Name des Formulars selbst – daher über elements gehen.
const feld = (form, name) => form.elements.namedItem(name);

function kundeVorschlagen(name) {
  const k = daten.kunden.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  const form = document.getElementById('vw-formular');
  if (!k || !form) return;
  feld(form, 'telefon').value = k.telefon;
  feld(form, 'strasse').value = k.strasse;
  feld(form, 'ort').value = k.ort;
}

function bestellungSpeichern(form) {
  const ch = aktiveCharge();
  const name = feld(form, 'name').value.trim();
  const mengen = formularMengen();
  const positionen = Object.entries(mengen)
    .filter(([, m]) => m > 0)
    .map(([artikelId, menge]) => ({ artikelId, menge }));
  const termin = form.querySelector('input[name="termin"]:checked');

  if (!name) return meldung('Bitte einen Namen eintragen.');
  if (!positionen.length) return meldung('Bitte mindestens einen Artikel wählen.');
  if (termin.dataset.art === 'lieferung' && (!feld(form, 'strasse').value.trim() || !feld(form, 'ort').value.trim())) {
    return meldung('Für die Lieferung bitte Adresse eintragen.');
  }

  let k = daten.kunden.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!k) {
    k = { id: `k${daten.kunden.length + 1}`, name, telefon: '', strasse: '', plz: '', ort: '', stammkunde: false };
    daten.kunden.push(k);
  }
  if (feld(form, 'telefon').value.trim()) k.telefon = feld(form, 'telefon').value.trim();
  if (feld(form, 'strasse').value.trim()) k.strasse = feld(form, 'strasse').value.trim();
  if (feld(form, 'ort').value.trim()) k.ort = feld(form, 'ort').value.trim();

  const reicht = positionen.every((p) => freieMenge(ch, p.artikelId) >= p.menge);
  const b = {
    id: `b${Date.now()}`,
    nummer: naechsteNummer(),
    chargeId: ch.id,
    kundeId: k.id,
    quelle: form.querySelector('input[name="quelle"]:checked').value,
    erstellt: new Date().toISOString().slice(0, 10),
    status: reicht ? 'vorgemerkt' : 'warteliste',
    terminId: termin.value,
    zahlart: form.querySelector('input[name="zahlart"]:checked').value,
    bezahlt: null,
    uebergeben: false,
    anmerkung: feld(form, 'anmerkung').value.trim(),
    positionen,
  };
  daten.bestellungen.push(b);

  zustand.filter = reicht ? 'alle' : 'warteliste';
  zustand.suche = '';
  location.hash = '#bestellungen';
  meldung(reicht
    ? `Gespeichert: ${b.nummer} für ${k.name}.`
    : `Nicht genug frei – ${k.name} steht auf der Warteliste.`);
}

// 5.4 Wiegen
function ansichtWiegen() {
  const ch = aktiveCharge();
  const liste = gewichtsPositionen(ch);
  const fertig = liste.filter((x) => x.p.gewichtG).length;
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Wiegen</h1>${chargeWahl()}
      <p class="vw-klein">Gesamtgewicht je Bestellung in kg eintippen (z. B. 6,15). Der Betrag wird sofort berechnet.</p></div>
    <section class="vw-karte">
      <p><strong id="vw-wiegen-stand">${fertig} von ${liste.length}</strong> gewogen</p>
      <div class="vw-balken"><span id="vw-wiegen-balken" style="width:${liste.length ? Math.round((fertig / liste.length) * 100) : 0}%"></span></div>
      ${liste.length ? liste.map(({ b, p, index }) => {
        const a = artikelVon(ch, p.artikelId);
        return `<label class="vw-wiegen-zeile${p.gewichtG ? ' vw-wiegen-zeile--fertig' : ''}">
          <span><strong>${esc(kundeVon(b).name)}</strong><br><span class="vw-klein">${p.menge}× ${esc(a.name)} · ${esc(b.nummer)}</span></span>
          <input type="text" inputmode="decimal" placeholder="kg" autocomplete="off"
            data-gewicht="${b.id}" data-index="${index}" value="${p.gewichtG ? kgFormat.format(p.gewichtG / 1000) : ''}"
            aria-label="Gewicht für ${esc(kundeVon(b).name)} in kg" />
          <span class="vw-wiegen-betrag" id="betrag-${b.id}-${index}">${gewichtsZeileText(ch, p)}</span>
        </label>`;
      }).join('') : '<p class="vw-klein">In dieser Charge gibt es keine Gewichtsware.</p>'}
      <div class="vw-knopfreihe"><button type="button" class="vw-knopf" data-aktion="drucken">Packzettel drucken</button></div>
    </section>`;
}

function gewichtsZeileText(ch, p) {
  const a = artikelVon(ch, p.artikelId);
  if (!p.gewichtG) return `${euro(a.preisCent)}/kg · noch nicht gewogen`;
  return `${kg(p.gewichtG)} × ${euro(a.preisCent)}/kg = ${euro(positionBetrag(ch, p).cent)}`;
}

function gewichtEintragen(input) {
  const b = bestellungVon(input.dataset.gewicht);
  const p = b.positionen[Number(input.dataset.index)];
  const kilo = parseFloat(input.value.replace(/\s/g, '').replace(',', '.'));
  p.gewichtG = Number.isFinite(kilo) && kilo > 0 ? Math.round(kilo * 1000) : undefined;
  const ch = chargeVon(b);
  document.getElementById(`betrag-${b.id}-${input.dataset.index}`).textContent = gewichtsZeileText(ch, p);
  input.closest('.vw-wiegen-zeile').classList.toggle('vw-wiegen-zeile--fertig', Boolean(p.gewichtG));
  const liste = gewichtsPositionen(ch);
  const fertig = liste.filter((x) => x.p.gewichtG).length;
  document.getElementById('vw-wiegen-stand').textContent = `${fertig} von ${liste.length}`;
  document.getElementById('vw-wiegen-balken').style.width = `${Math.round((fertig / liste.length) * 100)}%`;
}

// 5.5 Übergabe (Abholung und Liefertour)
function ansichtUebergabe() {
  const ch = aktiveCharge();
  const aktiv = bestellungenDerCharge(ch).filter(istAktiv);
  const anzahl = (art) => aktiv.filter((b) => terminVon(b).art === art && !b.uebergeben).length;
  const auswahl = aktiv.filter((b) => terminVon(b).art === zustand.uebergabeArt);
  const termine = ch.termine.filter((t) => t.art === zustand.uebergabeArt);

  let liste;
  if (zustand.uebergabeArt === 'abholung') {
    liste = auswahl
      .sort((x, y) => kundeVon(x).name.localeCompare(kundeVon(y).name, 'de'))
      .map(stoppKarte).join('');
  } else {
    const reihenfolge = (ort) => {
      const i = daten.tourReihenfolge.indexOf(ort);
      return i === -1 ? 99 : i;
    };
    const orte = [...new Set(auswahl.map((b) => kundeVon(b).ort))].sort((a, b) => reihenfolge(a) - reihenfolge(b));
    liste = orte.map((ort) => `<h2 class="vw-ort-titel">${esc(ort)}</h2>${auswahl
      .filter((b) => kundeVon(b).ort === ort)
      .map(stoppKarte).join('')}`).join('');
  }

  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Übergabe</h1>${chargeWahl()}
      <div class="vw-chips" role="group" aria-label="Abholung oder Lieferung">
        <button type="button" class="vw-chip" data-aktion="uebergabe-art" data-wert="abholung" aria-pressed="${zustand.uebergabeArt === 'abholung'}">Abholung am Hof (${anzahl('abholung')} offen)</button>
        <button type="button" class="vw-chip" data-aktion="uebergabe-art" data-wert="lieferung" aria-pressed="${zustand.uebergabeArt === 'lieferung'}">Liefertour (${anzahl('lieferung')} offen)</button>
      </div>
      ${termine.map((t) => `<p class="vw-klein">${terminText(t)}</p>`).join('')}
    </div>
    ${liste || '<p class="vw-klein">Keine Bestellungen.</p>'}`;
}

function stoppKarte(b) {
  const k = kundeVon(b);
  const lieferung = terminVon(b).art === 'lieferung';
  return `<article class="vw-karte vw-stopp${b.uebergeben ? ' vw-stopp--erledigt' : ''}">
    <div class="vw-dialog-kopf">
      <div><strong>${esc(k.name)}</strong> <span class="vw-klein">${esc(b.nummer)}</span></div>
      <strong>${betragText(bestellBetrag(b))}</strong>
    </div>
    <p>${esc(artikelKurz(b))}</p>
    ${lieferung ? `<p class="vw-klein">${esc(k.strasse)}, ${esc(k.plz)} ${esc(k.ort)}</p>` : ''}
    ${b.anmerkung ? `<p class="vw-klein">„${esc(b.anmerkung)}"</p>` : ''}
    <p class="vw-klein">${b.bezahlt ? `bezahlt (${ZAHLARTEN[b.bezahlt]})` : `noch offen – möchte ${ZAHLARTEN[b.zahlart]} zahlen`}</p>
    <div class="vw-knopfreihe">
      <button type="button" class="vw-knopf${b.uebergeben ? '' : ' vw-knopf--voll'}" data-aktion="uebergeben" data-id="${b.id}">${b.uebergeben ? 'Übergeben ✓ (rückgängig)' : 'Übergeben'}</button>
      ${!b.bezahlt ? `<button type="button" class="vw-knopf" data-aktion="bezahlt" data-wert="bar" data-id="${b.id}">Bar erhalten</button>` : ''}
      <a class="vw-knopf" href="tel:${esc(k.telefon.replace(/\s/g, ''))}">Anrufen</a>
      <a class="vw-knopf" href="${whatsappLink(b, bereitText(b))}" target="_blank" rel="noopener">WhatsApp</a>
      ${lieferung ? `<a class="vw-knopf" href="${navLink(b)}" target="_blank" rel="noopener">Navi</a>` : ''}
      <button type="button" class="vw-knopf" data-aktion="oeffnen" data-id="${b.id}">Details</button>
    </div>
  </article>`;
}

// 5.6 Zahlungen
function ansichtZahlungen() {
  const ch = aktiveCharge();
  const aktiv = bestellungenDerCharge(ch).filter(istAktiv);
  const offen = aktiv.filter((b) => !b.bezahlt);
  const bezahlt = aktiv.filter((b) => b.bezahlt);
  const summe = (liste) => liste.reduce((s, b) => s + bestellBetrag(b).cent, 0);
  const geschaetzt = offen.some((b) => bestellBetrag(b).geschaetzt);

  const zeile = (b) => `<div class="vw-zahlung">
    <button type="button" class="vw-zahlung-name" data-aktion="oeffnen" data-id="${b.id}">${esc(kundeVon(b).name)}</button>
    <strong class="vw-zeile-betrag">${betragText(bestellBetrag(b))}</strong>
    <span class="vw-klein vw-zahlung-info">Referenz ${esc(b.nummer)}${b.bezahlt ? '' : ` · möchte ${ZAHLARTEN[b.zahlart]}`}${b.uebergeben ? ' · übergeben' : ''}</span>
    ${b.bezahlt
      ? `<button type="button" class="vw-knopf" data-aktion="bezahlt" data-wert="" data-id="${b.id}">${ZAHLARTEN[b.bezahlt]} ✓ (rückgängig)</button>`
      : `<button type="button" class="vw-knopf vw-knopf--voll" data-aktion="bezahlt" data-wert="${b.zahlart}" data-id="${b.id}">${b.zahlart === 'bar' ? 'Bar erhalten' : 'Geld am Konto'}</button>`}
  </div>`;

  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Zahlungen</h1>${chargeWahl()}</div>
    <div class="vw-kennzahlen">
      <div class="vw-kennzahl"><strong>${euro(summe(aktiv))}</strong><span>Gesamt${geschaetzt ? ' (teils geschätzt)' : ''}</span></div>
      <div class="vw-kennzahl"><strong>${euro(summe(bezahlt))}</strong><span>bezahlt</span></div>
      <div class="vw-kennzahl${offen.length ? ' vw-kennzahl--achtung' : ''}"><strong>${euro(summe(offen))}</strong><span>offen (${offen.length})</span></div>
      <div class="vw-kennzahl"><strong>${aktiv.filter((b) => b.bezahlt === 'bar').length} / ${aktiv.filter((b) => b.bezahlt === 'ueberweisung').length}</strong><span>bar / Überweisung</span></div>
    </div>
    <section class="vw-karte"><h2>Noch offen</h2>
      ${offen.length ? offen.map(zeile).join('') : '<p class="vw-klein">Alles bezahlt.</p>'}
    </section>
    <section class="vw-karte"><h2>Bereits bezahlt</h2>
      ${bezahlt.length ? bezahlt.map(zeile).join('') : '<p class="vw-klein">Noch nichts.</p>'}
    </section>
    <button type="button" class="vw-knopf vw-knopf--breit" data-aktion="export">Liste für Excel herunterladen</button>`;
}

/* ------------------------------------------------------------
   6. DETAIL-DIALOG
   ------------------------------------------------------------ */
function detailOeffnen(id) {
  const b = bestellungVon(id);
  const dialog = document.getElementById('vw-dialog');
  if (!b || !dialog) return;
  const ch = chargeVon(b);
  const k = kundeVon(b);
  const t = terminVon(b);
  const summe = bestellBetrag(b);

  const positionen = b.positionen.map((p) => {
    const a = artikelVon(ch, p.artikelId);
    const betrag = positionBetrag(ch, p);
    const detail = a.art === 'gewicht'
      ? (p.gewichtG ? `${kg(p.gewichtG)} × ${euro(a.preisCent)}/kg` : `${euro(a.preisCent)}/kg, noch nicht gewogen`)
      : `je ${euro(a.preisCent)}`;
    return `<tr><td>${p.menge}× ${esc(a.name)}<br><span class="vw-klein">${detail}</span></td>
      <td class="vw-zahl">${betragText(betrag)}</td></tr>`;
  }).join('');

  let aktionen = '';
  if (b.status === 'vorgemerkt') {
    aktionen = `
      <button type="button" class="vw-knopf${b.uebergeben ? '' : ' vw-knopf--voll'}" data-aktion="uebergeben" data-id="${b.id}">${b.uebergeben ? 'Übergeben ✓ (rückgängig)' : 'Übergeben'}</button>
      ${b.bezahlt
        ? `<button type="button" class="vw-knopf" data-aktion="bezahlt" data-wert="" data-id="${b.id}">Bezahlt (${ZAHLARTEN[b.bezahlt]}) – rückgängig</button>`
        : `<button type="button" class="vw-knopf" data-aktion="bezahlt" data-wert="bar" data-id="${b.id}">Bar erhalten</button>
           <button type="button" class="vw-knopf" data-aktion="bezahlt" data-wert="ueberweisung" data-id="${b.id}">Geld am Konto</button>`}
      <button type="button" class="vw-knopf vw-knopf--warnung" data-aktion="stornieren" data-id="${b.id}">Stornieren</button>`;
  } else if (b.status === 'warteliste') {
    aktionen = `
      <button type="button" class="vw-knopf vw-knopf--voll" data-aktion="nachruecken" data-id="${b.id}">Nachrücken lassen</button>
      <button type="button" class="vw-knopf vw-knopf--warnung" data-aktion="stornieren" data-id="${b.id}">Von Warteliste streichen</button>`;
  } else {
    aktionen = `<button type="button" class="vw-knopf" data-aktion="wiederherstellen" data-id="${b.id}">Wiederherstellen</button>`;
  }

  dialog.innerHTML = `<div class="vw-dialog-inhalt">
    <div class="vw-dialog-kopf">
      <div><h2 id="vw-dialog-titel">${esc(k.name)}</h2>
        <span class="vw-klein">${esc(b.nummer)} · ${QUELLEN[b.quelle]} · ${datumKurz(b.erstellt)}${k.stammkunde ? ' · Stammkunde' : ''}</span></div>
      <button type="button" class="vw-schliessen" data-aktion="schliessen" aria-label="Schließen">×</button>
    </div>
    <div class="vw-abschnitt">${marken(b)}</div>
    <div class="vw-abschnitt">
      <p><strong>${terminText(t)}</strong></p>
      ${t.art === 'lieferung' ? `<p>${esc(k.strasse)}, ${esc(k.plz)} ${esc(k.ort)}</p>` : ''}
      <p>${esc(k.telefon)}</p>
      <div class="vw-knopfreihe">
        <a class="vw-knopf" href="tel:${esc(k.telefon.replace(/\s/g, ''))}">Anrufen</a>
        <a class="vw-knopf" href="${whatsappLink(b, bereitText(b))}" target="_blank" rel="noopener">WhatsApp „ist fertig"</a>
        ${t.art === 'lieferung' ? `<a class="vw-knopf" href="${navLink(b)}" target="_blank" rel="noopener">Navi</a>` : ''}
      </div>
    </div>
    <div class="vw-abschnitt">
      <table class="vw-tabelle"><tbody>${positionen}</tbody>
        <tfoot><tr><td>Summe</td><td class="vw-zahl">${betragText(summe)}</td></tr></tfoot></table>
      <p class="vw-klein">Zahlung gewünscht: ${ZAHLARTEN[b.zahlart]}</p>
      ${b.anmerkung ? `<p>„${esc(b.anmerkung)}"</p>` : ''}
    </div>
    <div class="vw-abschnitt vw-knopfreihe">${aktionen}</div>
  </div>`;
  dialog.dataset.id = b.id;
  if (!dialog.open) dialog.showModal();
}

function dialogAktualisieren() {
  const dialog = document.getElementById('vw-dialog');
  if (dialog && dialog.open && dialog.dataset.id) detailOeffnen(dialog.dataset.id);
}

/* ------------------------------------------------------------
   7. EXPORT (Excel) UND DRUCK (Packzettel)
   ------------------------------------------------------------ */
// CSV mit Semikolon, Dezimalkomma und BOM – öffnet sich im deutschsprachigen
// Excel per Doppelklick korrekt mit Umlauten und Spalten.
function exportieren() {
  const ch = aktiveCharge();
  // Zahlen ohne Anführungszeichen mit Dezimalkomma, damit Excel rechnen kann.
  // Text, der mit = + - @ beginnt, bekommt ein ' davor (sonst hält Excel ihn
  // für eine Formel); Telefonnummern werden als 0043 … geschrieben.
  const zelle = (v) => {
    if (typeof v === 'number') return String(v).replace('.', ',');
    let text = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const kopf = ['Bestellnr.', 'Datum', 'Kunde', 'Telefon', 'Adresse', 'Ort', 'Quelle', 'Status',
    'Übergabe', 'Termin', 'Artikel', 'Menge', 'Gewicht kg', 'Preis €', 'Preis je', 'Betrag €',
    'geschätzt', 'Zahlart', 'Bezahlt', 'Übergeben', 'Anmerkung'];
  const zeilen = [kopf];
  bestellungenDerCharge(ch)
    .filter((b) => b.status !== 'storniert')
    .forEach((b) => {
      const k = kundeVon(b);
      const t = terminVon(b);
      b.positionen.forEach((p) => {
        const a = artikelVon(ch, p.artikelId);
        const betrag = positionBetrag(ch, p);
        zeilen.push([b.nummer, b.erstellt, k.name, k.telefon.replace(/^\+/, '00'), k.strasse,
          `${k.plz} ${k.ort}`.trim(), QUELLEN[b.quelle], b.status,
          t.art === 'abholung' ? 'Abholung' : 'Lieferung', t.datum, a.name, p.menge,
          p.gewichtG ? p.gewichtG / 1000 : '', a.preisCent / 100, a.art === 'gewicht' ? 'kg' : 'Stück',
          betrag.cent / 100, betrag.geschaetzt ? 'ja' : '', ZAHLARTEN[b.zahlart],
          b.bezahlt ? ZAHLARTEN[b.bezahlt] : 'offen', b.uebergeben ? 'ja' : 'nein', b.anmerkung]);
      });
    });
  const csv = '﻿' + zeilen.map((z) => z.map(zelle).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `hofladen-${ch.titel.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-')}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  meldung('Liste für Excel wurde heruntergeladen.');
}

function packzettelDrucken() {
  const ch = aktiveCharge();
  const druck = document.getElementById('vw-druck');
  if (!druck) return;
  druck.innerHTML = bestellungenDerCharge(ch)
    .filter(istAktiv)
    .sort((x, y) => kundeVon(x).name.localeCompare(kundeVon(y).name, 'de'))
    .map((b) => {
      const k = kundeVon(b);
      const t = terminVon(b);
      return `<section class="vw-packzettel">
        <h2>${esc(k.name)} – ${esc(b.nummer)}</h2>
        <p>${terminText(t)}${t.art === 'lieferung' ? ` · ${esc(k.strasse)}, ${esc(k.ort)}` : ''} · ${esc(k.telefon)}</p>
        <table class="vw-tabelle"><tbody>${b.positionen.map((p) => {
          const a = artikelVon(ch, p.artikelId);
          return `<tr><td>${p.menge}× ${esc(a.name)}</td><td>${p.gewichtG ? kg(p.gewichtG) : ''}</td>
            <td class="vw-zahl">${betragText(positionBetrag(ch, p))}</td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td colspan="2">Summe · ${b.bezahlt ? 'bezahlt' : ZAHLARTEN[b.zahlart]}</td>
          <td class="vw-zahl">${betragText(bestellBetrag(b))}</td></tr></tfoot></table>
      </section>`;
    }).join('');
  window.print();
}

/* ------------------------------------------------------------
   8. MELDUNG
   ------------------------------------------------------------ */
let meldungTimer;
function meldung(text) {
  const toast = document.getElementById('vw-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('vw-toast--sichtbar');
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => toast.classList.remove('vw-toast--sichtbar'), 3000);
}

/* ------------------------------------------------------------
   9. NAVIGATION UND EREIGNISSE
   ------------------------------------------------------------ */
const ANSICHTEN = {
  uebersicht: ansichtUebersicht,
  bestellungen: ansichtBestellungen,
  neu: ansichtNeu,
  wiegen: ansichtWiegen,
  uebergabe: ansichtUebergabe,
  zahlungen: ansichtZahlungen,
};

function aktuelleAnsicht() {
  const name = location.hash.slice(1);
  return ANSICHTEN[name] ? name : 'uebersicht';
}

function zeigen() {
  const name = aktuelleAnsicht();
  ANSICHTEN[name]();
  document.querySelectorAll('.vw-nav a[data-ansicht]').forEach((a) => {
    if (a.dataset.ansicht === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function neuZeichnen() {
  // Formular nicht neu zeichnen, sonst gehen Eingaben verloren
  if (aktuelleAnsicht() !== 'neu') zeigen();
  dialogAktualisieren();
}

function initKlicks() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-aktion]');
    if (!el) return;
    const b = el.dataset.id ? bestellungVon(el.dataset.id) : null;

    switch (el.dataset.aktion) {
      case 'charge':
        zustand.chargeId = el.dataset.id;
        zeigen();
        break;
      case 'filter':
        zustand.filter = el.dataset.wert;
        if (aktuelleAnsicht() === 'bestellungen') zeigen();
        else location.hash = '#bestellungen';
        break;
      case 'uebergabe-art':
        zustand.uebergabeArt = el.dataset.wert;
        zeigen();
        break;
      case 'oeffnen':
        detailOeffnen(el.dataset.id);
        break;
      case 'schliessen':
        document.getElementById('vw-dialog').close();
        break;
      case 'uebergeben':
        b.uebergeben = !b.uebergeben;
        meldung(b.uebergeben ? `${kundeVon(b).name}: übergeben.` : 'Rückgängig gemacht.');
        neuZeichnen();
        break;
      case 'bezahlt':
        b.bezahlt = el.dataset.wert || null;
        meldung(b.bezahlt ? `${kundeVon(b).name}: bezahlt (${ZAHLARTEN[b.bezahlt]}).` : 'Zahlung zurückgesetzt.');
        neuZeichnen();
        break;
      case 'stornieren':
        b.status = 'storniert';
        meldung(`${b.nummer} storniert.`);
        neuZeichnen();
        break;
      case 'wiederherstellen':
      case 'nachruecken': {
        const ch = chargeVon(b);
        const reicht = b.positionen.every((p) => freieMenge(ch, p.artikelId) >= p.menge);
        if (!reicht && el.dataset.aktion === 'nachruecken') {
          meldung('Dafür ist nicht mehr genug frei.');
          break;
        }
        b.status = reicht ? 'vorgemerkt' : 'warteliste';
        meldung(reicht ? `${kundeVon(b).name} ist jetzt vorgemerkt.` : 'Nicht genug frei – zurück auf die Warteliste.');
        neuZeichnen();
        break;
      }
      case 'plus':
      case 'minus': {
        const out = document.getElementById(`menge-${el.dataset.id}`);
        const alt = Number(out.textContent);
        const neu = el.dataset.aktion === 'plus' ? alt + 1 : Math.max(0, alt - 1);
        out.textContent = String(neu);
        formularSummeAktualisieren();
        break;
      }
      case 'export':
        exportieren();
        break;
      case 'ankuendigung':
        ankuendigungOeffnen();
        break;
      case 'ankuendigung-whatsapp': {
        const text = document.getElementById('vw-ankuendigung').value;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        break;
      }
      case 'ankuendigung-kopieren': {
        const text = document.getElementById('vw-ankuendigung').value;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text)
            .then(() => meldung('Text kopiert – jetzt in WhatsApp einfügen.'))
            .catch(() => meldung('Kopieren nicht möglich – bitte Text markieren und kopieren.'));
        } else {
          meldung('Kopieren nicht möglich – bitte Text markieren und kopieren.');
        }
        break;
      }
      case 'drucken':
        packzettelDrucken();
        break;
      default:
        break;
    }
  });
}

function initEingaben() {
  document.addEventListener('input', (e) => {
    if (e.target.id === 'vw-suche') {
      zustand.suche = e.target.value;
      listeAktualisieren();
    } else if (e.target.dataset.gewicht) {
      gewichtEintragen(e.target);
    } else if (e.target.name === 'name' && e.target.form && e.target.form.id === 'vw-formular') {
      kundeVorschlagen(e.target.value);
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.name === 'termin') adresseUmschalten();
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'vw-formular') return;
    e.preventDefault();
    bestellungSpeichern(e.target);
  });

  // Klick auf den Hintergrund schließt den Dialog
  const dialog = document.getElementById('vw-dialog');
  if (dialog) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initKlicks();
  initEingaben();
  window.addEventListener('hashchange', () => {
    zeigen();
    window.scrollTo(0, 0);
  });
  zeigen();
});
