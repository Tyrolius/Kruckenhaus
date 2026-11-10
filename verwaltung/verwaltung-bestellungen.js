/* ============================================================
 * HOFLADEN-VERWALTUNG – ÜBERSICHT, BESTELLUNGEN, ERFASSEN
 * ============================================================
 * Abschnitte 5.1–5.3: Übersicht, „Mehr", Bestellliste, Bestellung erfassen.
 * Teil von verwaltung/ – Reihenfolge und Überblick: siehe Kopf von verwaltung.js.
 * ============================================================ */

'use strict';

/* ------------------------------------------------------------
   5. ANSICHTEN
   ------------------------------------------------------------ */
const inhalt = () => document.getElementById('vw-inhalt');

// Widerrufe (aus „Vertrag widerrufen" auf der Website) – über alle Bestellrunden
function zeitpunktKurz(sqlZeit) {
  return new Date(`${sqlZeit.replace(' ', 'T')}Z`).toLocaleString('de-AT', {
    timeZone: 'Europe/Vienna', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function widerrufeKarte() {
  const liste = daten.widerrufe || [];
  if (!liste.length) return '';
  return `<section class="vw-karte vw-karte--achtung" aria-label="Widerrufe"><h2>Widerrufe (${liste.length})</h2>
    <p class="vw-klein">Dem Kunden schon bestätigt. Stornieren bzw. Artikel klären, Bezahltes binnen 14 Tagen erstatten, dann „Erledigt".</p>
    ${liste.map((w) => `<div class="vw-widerruf">
      <p><strong>${esc(w.name)}</strong> · Nr. ${esc(w.nummer)} · ${zeitpunktKurz(w.eingegangen)} Uhr<br>
        Widerrufen: ${esc(w.umfang)}${w.email ? ` · <a href="mailto:${esc(w.email)}">${esc(w.email)}</a>` : ''}
        ${w.bestellungId ? '' : '<br><span class="vw-warnung">Passt zu keiner Bestellung (Nummer oder E-Mail falsch) – bitte klären.</span>'}</p>
      <div class="vw-knopfreihe">
        ${w.bestellungId && bestellungVon(w.bestellungId) ? `<button type="button" class="vw-knopf vw-knopf--klein" data-aktion="oeffnen" data-id="${w.bestellungId}">Bestellung öffnen</button>` : ''}
        <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="widerruf-erledigt" data-id="${w.id}">Erledigt</button>
      </div></div>`).join('')}
  </section>`;
}

// 5.1 Übersicht
// Alle laufenden Bestellrunden auf einen Blick, ohne Runde auswählen zu müssen:
// je Runde eine Karte mit Stand, dem, was dort zu tun ist (jede Zeile führt
// direkt hin), „Noch frei" und den Handgriffen dieser Runde. Was zu tun ist,
// steht nur einmal da – bei der Runde, zu der es gehört.
function rundenStand(ch) {
  const alle = bestellungenDerCharge(ch);
  const aktiv = alle.filter(istAktiv);
  return {
    ch,
    aktiv,
    warteliste: alle.filter((b) => b.status === 'warteliste').length,
    offenCent: aktiv.filter((b) => !b.bezahlt).reduce((s, b) => s + bestellBetrag(b).cent, 0),
    nichtUebergeben: aktiv.filter((b) => !b.uebergeben && !ohneTerminOffen(b)).length,
    geldFehlt: aktiv.filter((b) => b.uebergeben && !b.bezahlt).length,
    neue: alle.filter((b) => b.neu).length,
    ohneTermin: aktiv.filter(ohneTerminOffen).length,
    vormerkungen: passendeVoranmeldungen(ch).length,
  };
}

// Was in einer Runde zu tun ist: [Feld im Stand, Text, Ziel, Filter in „Bestellungen"]
const RUNDEN_AUFGABEN = [
  ['neue', 'Neue Bestellungen über die Website', '#bestellungen', 'neu'],
  ['ohneTermin', 'Termin mit dem Kunden klären', '#bestellungen', 'termin-offen'],
  ['vormerkungen', 'Vormerkungen übernehmen', '#voranmeldungen', ''],
  ['warteliste', 'Auf der Warteliste', '#bestellungen', 'warteliste'],
  ['nichtUebergeben', 'Noch abzuholen bzw. zu liefern', '#uebergabe', ''],
  ['geldFehlt', 'Übergeben, Geld noch nicht da', '#zahlungen', ''],
];
const aufgabenAnzahl = (st) => RUNDEN_AUFGABEN.filter(([feldName]) => st[feldName]).length;

function rundenKarte(st, mehrereRunden) {
  const { ch, aktiv } = st;
  const dauer = istDauer(ch);
  const zeile = (inhaltHtml) => `<li>${inhaltHtml}</li>`;
  const oeffnen = (ziel, text) => `<button type="button" data-aktion="runde-oeffnen" data-runde="${ch.id}" data-ziel="${ziel}">${text}</button>`;
  const aktion = (name, text) => `<button type="button" data-aktion="${name}" data-runde="${ch.id}">${text}</button>`;
  const hatGewichtsware = ch.artikel.some((a) => a.art === 'gewicht');

  const aufgaben = RUNDEN_AUFGABEN.filter(([feldName]) => st[feldName]).map(([feldName, text, ziel, filter]) =>
    `<li><button type="button" data-aktion="runde-oeffnen" data-runde="${ch.id}" data-ziel="${ziel}" data-filter="${filter}">
      <span>${text}</span><span class="vw-anzahl">${st[feldName]}</span></button></li>`).join('');

  let freiHtml;
  if (dauer) {
    const artikel = ch.artikel.filter((a) => (produktVon(a.produktId) || {}).verkaufsart === 'dauer');
    const aus = artikel.filter((a) => freieMenge(ch, a.id) <= 0);
    freiHtml = `<p class="vw-klein">${artikel.length - aus.length} von ${artikel.length} Dauerartikeln verfügbar${aus.length
      ? ` · ausverkauft: ${aus.map((a) => esc(a.name)).join(', ')}` : ''}. „Ausverkauft" und Preise ändert ihr im
      <a href="#sortiment">Sortiment</a>.</p>`;
  } else {
    const aus = ch.artikel.filter((a) => freieMenge(ch, a.id) <= 0).length;
    // Am Handy zugeklappt, damit die Übersicht kurz bleibt
    const offen = window.matchMedia('(min-width: 768px)').matches || aus > 0;
    freiHtml = `<details class="vw-mehr vw-frei"${offen ? ' open' : ''}><summary>Noch frei${aus ? ` – ${aus} ausverkauft` : ''}</summary>
      <div class="vw-frei-liste">${ch.artikel.map((a) => {
        const frei = freieMenge(ch, a.id);
        const anteil = a.kontingent ? Math.min(100, Math.round(((a.kontingent - frei) / a.kontingent) * 100)) : 100;
        return `<div class="vw-frei-zeile">
          <span class="vw-frei-name">${esc(a.name)}</span>
          <span class="vw-balken${frei <= 0 ? ' vw-balken--voll' : ''}" aria-hidden="true"><span style="width:${anteil}%"></span></span>
          <strong class="vw-frei-zahl">${frei > 0 ? `${frei} frei` : 'aus'}</strong>
        </div>`;
      }).join('')}</div></details>`;
  }

  const stand = [
    `${aktiv.length} ${aktiv.length === 1 ? 'Bestellung' : 'Bestellungen'}`,
    st.offenCent ? `<span class="vw-warnung">${euro(st.offenCent)} offen</span>` : (aktiv.length ? 'alles bezahlt' : ''),
  ].filter(Boolean).join(' · ');
  const fertig = !dauer && aktiv.length && aktiv.every((b) => b.uebergeben && b.bezahlt) && !st.warteliste;

  return `<section class="vw-karte vw-runden-karte" aria-label="${esc(ch.titel)}">
    <div class="vw-runden-kopf"><h2>${esc(ch.titel)}</h2>
      <span class="vw-klein">${dauer ? 'Immer erhältlich, ohne Bestellschluss'
        : [CHARGE_KURZ[ch.status], `Bestellschluss ${datumKurz(ch.bestellschluss)}`].filter(Boolean).join(' · ')}</span></div>
    <p class="vw-runden-stand">${stand}</p>
    <ul class="vw-aufgaben vw-aufgaben--runde">
      ${aufgaben || (aktiv.length && !fertig ? '<li class="vw-erledigt-hinweis">Gerade nichts zu tun ✓</li>' : '')}
      <li><button type="button" data-aktion="runde-oeffnen" data-runde="${ch.id}" data-ziel="#bestellungen" data-filter="">
        <span>Alle Bestellungen</span><span class="vw-pfeil" aria-hidden="true">›</span></button></li>
    </ul>
    ${fertig ? `<p class="vw-klein">Alles übergeben und bezahlt. Abgeschlossene Runden verschwinden aus dem Alltag, bleiben aber in der Auswertung.</p>
      <button type="button" class="vw-knopf vw-knopf--breit" data-aktion="runde-status" data-id="${ch.id}" data-wert="archiviert">Bestellrunde abschließen</button>` : ''}
    ${freiHtml}
    <details class="vw-mehr"><summary>Bearbeiten, Drucken, Export …</summary>
      <ul class="vw-aufgaben">
        ${dauer ? '' : zeile(oeffnen('#charge', 'Bestellrunde bearbeiten (Preise, Mengen, Termine)'))}
        ${zeile(aktion('ankuendigung', 'Ankündigung für WhatsApp'))}
        ${zeile(aktion('listen-drucken', 'Abhol- und Lieferlisten drucken (alle Tage)'))}
        ${zeile(oeffnen('#zahlungen', 'Alle Zahlungen'))}
        ${zeile(hatGewichtsware ? oeffnen('#wiegen', 'Vorab wiegen und Packzettel drucken') : aktion('drucken', 'Packzettel drucken'))}
        ${zeile(aktion('export', 'Liste für Excel herunterladen'))}
      </ul>
      ${dauer ? '' : `<p class="vw-klein">Termine: ${ch.termine.length ? ch.termine.map(terminText).join(' · ') : 'noch keine'}</p>`}
    </details>
  </section>`;
}

function ansichtUebersicht() {
  // Bestellrunden mit Termin zuerst, das Dauersortiment zuletzt
  const runden = daten.chargen.filter((c) => !istDauer(c)).concat(daten.chargen.filter(istDauer));
  const staende = runden.map(rundenStand);
  const mehrereRunden = runden.length > 1;
  const aktivGesamt = staende.reduce((s, st) => s + st.aktiv.length, 0);
  const offenGesamt = staende.reduce((s, st) => s + st.offenCent, 0);
  const zuTun = staende.reduce((s, st) => s + aufgabenAnzahl(st), 0) + (daten.widerrufe || []).length;

  // Eine Zeile statt Kacheln: das Wichtigste über alle Runden
  const kurz = [
    `${aktivGesamt} ${aktivGesamt === 1 ? 'Bestellung' : 'Bestellungen'}${mehrereRunden ? ` in ${runden.length} Runden` : ''}`,
    offenGesamt ? `<span class="vw-warnung">${euro(offenGesamt)} noch nicht bezahlt</span>` : (aktivGesamt ? 'alles bezahlt' : ''),
    zuTun ? '' : 'nichts zu tun ✓',
  ].filter(Boolean).join(' · ');

  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Übersicht</h1></div>
    <p class="vw-uebersicht-hinweis">${kurz}</p>
    ${widerrufeKarte()}
    ${staende.map((st) => rundenKarte(st, mehrereRunden)).join('')}
    <p><a class="vw-knopf" href="#charge-neu">+ Neue Bestellrunde</a></p>
    ${nutzerZeile()}`;
}

// 5.1a Mehr (nur am Handy in der Leiste): alles, was am PC in der Seitenleiste steht
function ansichtMehr() {
  const vormerkungen = daten.voranmeldungen.filter((v) => v.status === 'offen').length;
  const punkt = (ziel, titel, text, anzahl = 0) => `<li><a href="${ziel}"><span><strong>${titel}</strong><br>
    <span class="vw-klein">${text}</span></span>${anzahl ? `<span class="vw-anzahl">${anzahl}</span>` : '<span class="vw-pfeil" aria-hidden="true">›</span>'}</a></li>`;
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Mehr</h1></div>
    <section class="vw-karte" aria-label="Hofladen"><h2>Hofladen</h2>
      <ul class="vw-aufgaben">
        ${punkt('#voranmeldungen', 'Vormerkungen', 'Unverbindlich vorgemerkt – in eine Bestellrunde übernehmen', vormerkungen)}
        ${punkt('#charge-neu', 'Neue Bestellrunde', 'Produkte, Preise, Mengen und Termine festlegen')}
      </ul>
    </section>
    <section class="vw-karte" aria-label="Einrichten"><h2>Einrichten</h2>
      <ul class="vw-aufgaben">
        ${punkt('#sortiment', 'Sortiment', 'Produkte anlegen, ändern, als ausverkauft markieren')}
        ${punkt('#auswertung', 'Auswertung', 'Umsatz je Jahr, Excel für die Buchhaltung')}
        ${punkt('#bertha', 'Bertha', 'Verbindung zum Eierkunden-Portal')}
      </ul>
    </section>
    <section class="vw-karte" aria-label="Ferienwohnung"><h2>Ferienwohnung</h2>
      <ul class="vw-aufgaben">
        ${punkt('angebot.html', 'Angebot', 'Antwort auf eine Anfrage berechnen und als Text holen')}
        ${punkt('preise.html', 'Preise', 'Preise der Ferienwohnung (Entwurf)')}
      </ul>
    </section>
    ${nutzerZeile()}`;
}

// 5.2 Bestellungen
const FILTER = [
  ['alle', 'Alle'],
  ['neu', 'Neu'],
  ['abholung', 'Abholung'],
  ['lieferung', 'Lieferung'],
  ['offen', 'Nicht bezahlt'],
  ['termin-offen', 'Termin offen'],
  ['warteliste', 'Warteliste'],
  ['hof', 'Verkauf am Hof'],
  ['storniert', 'Storniert'],
];

function passtZumFilter(b) {
  switch (zustand.filter) {
    case 'abholung':
    case 'lieferung': return istAktiv(b) && terminArt(b) === zustand.filter;
    case 'termin-offen': return ohneTerminOffen(b);
    case 'neu': return b.neu;
    case 'hof': return istAktiv(b) && istHofverkauf(b);
    case 'offen': return istAktiv(b) && !b.bezahlt;
    case 'warteliste': return b.status === 'warteliste';
    case 'storniert': return b.status === 'storniert';
    default: return b.status !== 'storniert';
  }
}

// Bestellungen der gewählten Runde – oder aller laufenden Runden zusammen
const listenBestellungen = () => (zustand.alleRunden ? daten.bestellungen.filter((b) => chargeVon(b) && daten.chargen.includes(chargeVon(b)))
  : bestellungenDerCharge());

function ansichtBestellungen() {
  const alle = listenBestellungen();
  const anzahl = (wert) => {
    const vorher = zustand.filter;
    zustand.filter = wert;
    const n = alle.filter(passtZumFilter).length;
    zustand.filter = vorher;
    return n;
  };
  // Filter als Chips mit Anzahl; leere Filter gar nicht erst anbieten
  const filter = FILTER.map(([wert, text]) => [wert, text, anzahl(wert)])
    .filter(([wert, , n]) => wert === 'alle' || n || zustand.filter === wert);
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Bestellungen</h1>${chargeWahl({ alle: true })}${rundenReiter('bestellungen')}
      <input type="search" class="vw-suche" id="vw-suche" placeholder="Name, Ort oder Nummer suchen …"
        aria-label="Bestellungen durchsuchen" value="${esc(zustand.suche)}" />
      <div class="vw-chips vw-chips--zeile" role="group" aria-label="Anzeigen">${filter.map(([wert, text, n]) =>
        `<button type="button" class="vw-chip" data-aktion="filter" data-wert="${wert}" aria-pressed="${zustand.filter === wert}">${text} <span class="vw-chip-zahl">${n}</span></button>`).join('')}</div>
      ${zustand.filter === 'neu' && alle.some((b) => b.neu)
        ? '<button type="button" class="vw-knopf vw-knopf--klein" data-aktion="alle-gesehen">Alle als gesehen markieren</button>' : ''}
    </div>
    <div class="vw-liste" id="vw-liste"></div>`;
  listeAktualisieren();
}

function listeAktualisieren() {
  const liste = document.getElementById('vw-liste');
  if (!liste) return;
  const suche = zustand.suche.trim().toLowerCase();
  const treffer = listenBestellungen()
    .filter(passtZumFilter)
    .filter((b) => {
      if (!suche) return true;
      const k = kundeVon(b);
      return `${k.name} ${k.ort} ${b.nummer} ${k.telefon}`.toLowerCase().includes(suche);
    })
    // Neue zuerst (neueste oben), sonst nach Name
    .sort((x, y) => (zustand.filter === 'neu'
      ? y.nummer.localeCompare(x.nummer)
      : kundeVon(x).name.localeCompare(kundeVon(y).name, 'de')));
  liste.innerHTML = treffer.length
    ? treffer.map(bestellZeile).join('')
    : '<p class="vw-klein">Keine Bestellungen gefunden.</p>';
}

// Erfassen: drei Arten, oben umschaltbar
function erfassenUmschalter(aktiv) {
  return `<div class="vw-segment" role="group" aria-label="Was erfassen?">
    <a href="#neu" aria-pressed="${aktiv === 'neu'}">Bestellung</a>
    <a href="#hofverkauf" aria-pressed="${aktiv === 'hof'}">Verkauf am Hof</a>
    <a href="#vormerken" aria-pressed="${aktiv === 'vormerken'}">Vormerkung</a>
  </div>`;
}

// 5.3 Bestellung erfassen (Telefon, WhatsApp, persönlich)
function ansichtNeu() {
  const ch = aktiveCharge();
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Erfassen</h1>${erfassenUmschalter('neu')}${chargeWahl()}
      <p class="vw-klein">Bestellung per Telefon, WhatsApp oder persönlich – für einen späteren Termin.</p></div>
    <form class="vw-karte" id="vw-formular" novalidate>
      <label class="vw-feld"><span>Name</span>
        <input name="name" list="vw-kundenliste" autocomplete="off" required placeholder="Name eintippen – bekannte Kunden werden vorgeschlagen" />
      </label>
      <datalist id="vw-kundenliste">${daten.kunden.map((k) => `<option value="${esc(k.name)}">${esc(k.ort)}</option>`).join('')}</datalist>
      <label class="vw-feld"><span>Telefon</span><input name="telefon" type="tel" inputmode="tel" /></label>
      <label class="vw-feld"><span>E-Mail (optional – für Bestätigungen und „Meine Bestellungen")</span><input name="email" type="email" autocomplete="off" /></label>
      <fieldset class="vw-feldgruppe"><legend>Wie kam die Bestellung?</legend>
        <div class="vw-auswahl vw-auswahl--reihe">
          <label><input type="radio" name="quelle" value="whatsapp" checked /> WhatsApp</label>
          <label><input type="radio" name="quelle" value="telefon" /> Telefon</label>
          <label><input type="radio" name="quelle" value="persoenlich" /> persönlich</label>
        </div>
      </fieldset>

      <fieldset class="vw-feldgruppe"><legend>Was?</legend>
        ${ch.artikel.map((a) => `
          <div class="vw-zaehler-zeile">
            <div><strong>${esc(a.name)}</strong><br>
              <span class="vw-klein">${a.art === 'gewicht' ? `ca. ${kgFormat.format(a.richtVonG / 1000)}–${kgFormat.format(a.richtBisG / 1000)} kg/Stück · ` : ''}${freiText(ch, a.id)}</span>
              <details class="vw-preis-aendern" data-preis-artikel="${a.id}">
                <summary><span data-preis-text>${preisKurz(a, a.preisCent)}</span> · <span class="vw-preis-aendern-wort">ändern</span></summary>
                <label class="vw-pos-preis vw-pos-preis--erfassen"><span class="vw-klein">Preis${a.art === 'gewicht' ? ' €/kg' : ' €'}</span>
                  <input type="text" inputmode="decimal" autocomplete="off" value="${textAusCent(a.preisCent)}" data-erfassen-preis="${a.id}"
                    aria-label="Preis ${esc(a.name)} für diese Bestellung (z. B. Gasthaus-Preis)" /></label>
                <span class="vw-klein">Nur für diese Bestellung, z. B. Gasthaus-Preis.</span>
              </details>
              <span class="vw-klein vw-preis-hinweis" id="preis-hinweis-${a.id}"></span></div>
            <div class="vw-zaehler">
              <button type="button" data-aktion="minus" data-id="${a.id}" aria-label="${esc(a.name)} weniger">−</button>
              <input type="number" class="vw-menge-feld" id="menge-${a.id}" data-artikel="${a.id}" value="0" min="0" max="999"
                inputmode="numeric" aria-label="Menge ${esc(a.name)}" />
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
        <label class="vw-feld"><span>PLZ</span><input name="plz" inputmode="numeric" autocomplete="off" /></label>
        <label class="vw-feld"><span>Ort</span><input name="ort" autocomplete="off" /></label>
        <p class="vw-klein">Liefergebiet: ${daten.liefergebiet && daten.liefergebiet.length
          ? daten.liefergebiet.map((l) => `${esc(l.plz)} ${esc(l.ort)}`).join(', ')
          : esc(daten.tourReihenfolge.join(', '))}</p>
      </div>

      <fieldset class="vw-feldgruppe"><legend>Zahlung</legend>
        <div class="vw-auswahl vw-auswahl--reihe">
          <label><input type="radio" name="zahlart" value="bar" checked /> bar</label>
          <label><input type="radio" name="zahlart" value="ueberweisung" /> Überweisung</label>
        </div>
      </fieldset>

      <label class="vw-feld"><span>Anmerkung (optional)</span><textarea name="anmerkung" rows="2"></textarea></label>

      <div class="vw-speicherleiste">
        <div class="vw-gesamt"><span>Summe</span><span id="vw-summe">${betragText({ cent: 0, geschaetzt: false })}</span></div>
        <button type="submit" class="vw-knopf vw-knopf--voll vw-knopf--breit">Bestellung speichern</button>
      </div>
    </form>`;
  adresseUmschalten();
}

function formularMengen() {
  const mengen = {};
  document.querySelectorAll('#vw-formular [data-artikel]').forEach((o) => {
    const menge = Number(o.value);
    mengen[o.dataset.artikel] = Number.isInteger(menge) && menge > 0 ? Math.min(menge, 999) : 0;
  });
  return mengen;
}

// „€ 12,00/kg" bzw. „€ 4,00" – Preis eines Artikels in Kurzform
const preisKurz = (a, cent) => `${euro(cent)}${a.art === 'gewicht' ? '/kg' : ''}`;

// Eingeklappter Preis im Formular „Erfassen": Text der Zeile nachführen
function erfassenPreisZeile(el) {
  const ch = aktiveCharge();
  const a = artikelVon(ch, el.dataset.erfassenPreis);
  const kasten = el.closest('.vw-preis-aendern');
  if (!a || !kasten) return;
  const cent = centAusText(el.value);
  const text = kasten.querySelector('[data-preis-text]');
  if (text) text.textContent = preisKurz(a, cent == null ? a.preisCent : cent);
  kasten.classList.toggle('vw-preis-aendern--sonder', cent != null && cent !== a.preisCent);
}

// Preis im Formular „Erfassen" (vorbelegt mit dem Rundenpreis); undefined = Rundenpreis
function erfassenPreis(artikelId) {
  const el = document.querySelector(`#vw-formular [data-erfassen-preis="${artikelId}"]`);
  const cent = el ? centAusText(el.value) : null;
  return cent == null ? undefined : cent;
}

function formularSummeAktualisieren() {
  const ch = aktiveCharge();
  const mengen = formularMengen();
  const erg = Object.entries(mengen)
    .filter(([, m]) => m > 0)
    .reduce((s, [artikelId, menge]) => {
      const p = positionBetrag(ch, { artikelId, menge, einzelpreisCent: erfassenPreis(artikelId) });
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

// Preise im Formular „Erfassen": gemerkter Preis des Kunden, sonst Rundenpreis
function erfassenPreiseVorbelegen(k) {
  const ch = aktiveCharge();
  document.querySelectorAll('#vw-formular [data-erfassen-preis]').forEach((el) => {
    const a = artikelVon(ch, el.dataset.erfassenPreis);
    const gemerkt = k ? kundenPreis(k.id, a.produktId) : undefined;
    el.value = textAusCent(gemerkt ?? a.preisCent);
    el.closest('.vw-pos-preis').classList.toggle('vw-pos-preis--sonder', gemerkt !== undefined && gemerkt !== a.preisCent);
    erfassenPreisZeile(el);
    const hinweis = document.getElementById(`preis-hinweis-${a.id}`);
    if (hinweis) hinweis.textContent = gemerkt !== undefined && gemerkt !== a.preisCent ? `Preis vom letzten Mal (sonst ${euro(a.preisCent)})` : '';
  });
  formularSummeAktualisieren();
}

function kundeVorschlagen(name) {
  const k = daten.kunden.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  const form = document.getElementById('vw-formular');
  if (form) erfassenPreiseVorbelegen(k);
  if (!k || !form) return;
  feld(form, 'telefon').value = k.telefon;
  feld(form, 'email').value = k.email || '';
  feld(form, 'strasse').value = k.strasse;
  feld(form, 'plz').value = k.plz;
  feld(form, 'ort').value = k.ort;
}

const kundeNachName = (name) => daten.kunden.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());

async function bestellungSpeichern(form) {
  const ch = aktiveCharge();
  const name = feld(form, 'name').value.trim();
  const mengen = formularMengen();
  const positionen = Object.entries(mengen)
    .filter(([, m]) => m > 0)
    .map(([artikelId, menge]) => {
      const preisCent = erfassenPreis(artikelId);
      // Nur mitschicken, wenn er vom Rundenpreis abweicht (Gasthaus-Preis)
      return preisCent !== undefined && preisCent !== artikelVon(ch, artikelId).preisCent
        ? { artikelId, menge, preisCent } : { artikelId, menge };
    });
  const termin = form.querySelector('input[name="termin"]:checked');
  const kontakt = {
    name,
    telefon: feld(form, 'telefon').value.trim(),
    email: feld(form, 'email').value.trim(),
    strasse: feld(form, 'strasse').value.trim(),
    plz: feld(form, 'plz').value.trim(),
    ort: feld(form, 'ort').value.trim(),
  };

  if (!name) return meldung('Bitte einen Namen eintragen.');
  if (!positionen.length) return meldung('Bitte mindestens einen Artikel wählen.');
  if (!termin) return meldung('Bitte einen Termin wählen.');
  if (termin.dataset.art === 'lieferung' && (!kontakt.strasse || !kontakt.ort)) {
    return meldung('Für die Lieferung bitte Adresse eintragen.');
  }
  const bekannt = kundeNachName(name);
  const eingabe = {
    chargeId: ch.id,
    kundeId: bekannt ? bekannt.id : null,
    kunde: kontakt,
    terminId: termin.value,
    quelle: form.querySelector('input[name="quelle"]:checked').value,
    zahlart: form.querySelector('input[name="zahlart"]:checked').value,
    anmerkung: feld(form, 'anmerkung').value.trim(),
    positionen,
  };

  const erg = await speichern('bestellung', eingabe, () => {
    let k = bekannt;
    if (!k) {
      k = { id: `k${Date.now()}`, name, telefon: '', strasse: '', plz: '', ort: '', stammkunde: false };
      daten.kunden.push(k);
    }
    ['telefon', 'email', 'strasse', 'plz', 'ort'].forEach((f) => { if (kontakt[f]) k[f] = kontakt[f]; });
    const reicht = positionen.every((p) => freieMenge(ch, p.artikelId) >= p.menge);
    const b = {
      id: `b${Date.now()}`, nummer: naechsteNummer(), chargeId: ch.id, kundeId: k.id,
      quelle: eingabe.quelle, erstellt: new Date().toISOString().slice(0, 10),
      status: reicht ? 'vorgemerkt' : 'warteliste', terminId: eingabe.terminId, zahlart: eingabe.zahlart,
      bezahlt: null, uebergeben: false, anmerkung: eingabe.anmerkung,
      positionen: positionen.map((p, i) => ({ id: `b${Date.now()}-p${i}`, artikelId: p.artikelId, menge: p.menge,
        einzelpreisCent: p.preisCent ?? artikelVon(ch, p.artikelId).preisCent })),
    };
    positionen.forEach((p) => {
      const produktId = artikelVon(ch, p.artikelId).produktId;
      daten.kundenPreise = (daten.kundenPreise || []).filter((x) => !(x.kundeId === k.id && x.produktId === produktId));
      if (p.preisCent !== undefined) daten.kundenPreise.push({ kundeId: k.id, produktId, preisCent: p.preisCent });
    });
    daten.bestellungen.push(b);
    return { bestellung: b };
  }, { neuZeichnen: false });
  if (!erg) return;

  const vorgemerkt = erg.bestellung.status === 'vorgemerkt';
  zustand.filter = vorgemerkt ? 'alle' : 'warteliste';
  zustand.suche = '';
  location.hash = '#bestellungen';
  meldung(vorgemerkt
    ? `Gespeichert: ${erg.bestellung.nummer} für ${name}.`
    : `Nicht genug frei – ${name} steht auf der Warteliste.`);
}
