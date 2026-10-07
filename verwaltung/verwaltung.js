/* ============================================================
 * HOFLADEN-VERWALTUNG
 * ============================================================
 * Verwaltung der Vorbestellungen (Plan: docs/HOFLADEN-VORBESTELLUNG.md,
 * Abschnitt 7). Lädt den Stand von /api/verwaltung/stand und speichert
 * jede Änderung sofort über /api/verwaltung/… (Zugang nur über
 * Cloudflare Access). Nichts wird im Browser gespeichert – bewusst ohne
 * localStorage (siehe CLAUDE.md).
 *
 * Beispielmodus: verwaltung/?entwurf – erfundene Daten aus
 * entwurf-daten.js, nur im Arbeitsspeicher, nichts wird gespeichert.
 *
 * Ansichten (Adresse hinter #):
 *   uebersicht · bestellungen · neu · hofverkauf · uebergabe · voranmeldungen ·
 *   sortiment · bereiche · produkt (bearbeiten) · wiegen · zahlungen ·
 *   charge (bearbeiten) · charge-neu
 * Eine Bestellrunde heißt in der Datenbank „charge" (Tabelle chargen).
 * ============================================================ */

'use strict';

/* ------------------------------------------------------------
   1. ZUSTAND
   ------------------------------------------------------------ */
const BEISPIEL = new URLSearchParams(location.search).has('entwurf');
let daten = null;            // Stand aus der Schnittstelle (bzw. Beispieldaten)
let ladeFehler = '';
let beschaeftigt = false;    // verhindert doppeltes Absenden
const zustand = {
  chargeId: null,
  filter: 'alle',
  suche: '',
  uebergabeArt: 'abholung',
  nutzer: '',
  chargeForm: null,          // Arbeitskopie im Formular „Bestellrunde"
  produktForm: null,         // Arbeitskopie im Formular „Produkt" (Sortiment)
  stueck: {},                // Übergabe: getippte Gewichte je Position { posId: ['1,85', …] }
  abgabeId: null,            // Übergabe: gerade geöffneter Kunde
  zahlungsinfoDanach: null,  // Übergabe: Zahlungsinfo nach dem Wechsel zur Liste zeigen
  uebergabeTermin: null,     // Übergabe: nur dieser Termin (null = alle Tage)
  alleRunden: false,         // Bestellungen: alle laufenden Bestellrunden zusammen
  auswertung: null,          // geladene Jahresauswertung { jahr, jahre, runden, bestellungen }
  reihenfolge: false,        // Liefertour: Reihenfolge-Modus mit ↑ ↓
  hof: { mengen: {}, stueck: {}, name: '' }, // Verkauf am Hof (Formular)
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
const ZEITRAEUME = {
  naechste: 'nächste Bestellrunde',
  fruehjahr: 'Frühjahr',
  sommer: 'Sommer',
  herbst: 'Herbst',
  martini: 'Martini',
  weihnachten: 'Weihnachten',
};
const zeitraumText = (v) => (v.zeitraum === 'naechste' ? ZEITRAEUME.naechste : `${ZEITRAEUME[v.zeitraum]} ${v.jahr}`);

/* ------------------------------------------------------------
   3. DATEN UND BERECHNUNGEN
   ------------------------------------------------------------ */
const aktiveCharge = () => daten.chargen.find((c) => c.id === zustand.chargeId);
const chargeVon = (b) => daten.chargen.concat(daten.archiv || []).find((c) => c.id === b.chargeId);
const kundeVon = (b) => daten.kunden.find((k) => k.id === b.kundeId);
const artikelVon = (ch, id) => ch.artikel.find((a) => a.id === id);
// Übernommene Voranmeldungen haben anfangs keinen Termin (null)
const terminVon = (b) => chargeVon(b).termine.find((t) => t.id === b.terminId) || null;
const terminArt = (b) => (terminVon(b) ? terminVon(b).art : null);
const produktVon = (id) => daten.produkte.find((p) => p.id === id);
const bestellungVon = (id) => daten.bestellungen.find((b) => b.id === id);

const bestellungenDerCharge = (ch = aktiveCharge()) =>
  daten.bestellungen.filter((b) => b.chargeId === ch.id);

const istAktiv = (b) => b.status === 'vorgemerkt';
// Verkauf am Hof ohne Vorbestellung: kein Termin, gleich übergeben
const istHofverkauf = (b) => !b.terminId && b.interneNotiz === 'Verkauf am Hof';
// Ohne Termin und noch zu klären (übernommene Voranmeldungen)
const ohneTerminOffen = (b) => istAktiv(b) && !terminVon(b) && !istHofverkauf(b);

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
// Bestehende Bestellungen rechnen mit ihrem Preis zum Bestellzeitpunkt
// (einzelpreisCent), neue Eingaben mit dem aktuellen Preis der Bestellrunde.
const preisVon = (ch, pos) => pos.einzelpreisCent ?? artikelVon(ch, pos.artikelId).preisCent;

function positionBetrag(ch, pos) {
  const a = artikelVon(ch, pos.artikelId);
  const preis = preisVon(ch, pos);
  if (a.art !== 'gewicht') return { cent: preis * pos.menge, geschaetzt: false };
  if (pos.gewichtG) return { cent: Math.round((preis * pos.gewichtG) / 1000), geschaetzt: false };
  const mittelG = (a.richtVonG + a.richtBisG) / 2;
  return { cent: Math.round((preis * mittelG * pos.menge) / 1000), geschaetzt: true };
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
   3a. LADEN UND SPEICHERN
   ------------------------------------------------------------ */
function skriptLaden(pfad) {
  return new Promise((ok, fehler) => {
    const skript = document.createElement('script');
    skript.src = pfad;
    skript.onload = ok;
    skript.onerror = () => fehler(new Error(`${pfad} nicht gefunden.`));
    document.head.appendChild(skript);
  });
}

async function laden() {
  if (BEISPIEL) {
    if (!daten) {
      await skriptLaden('entwurf-daten.js');
      daten = JSON.parse(JSON.stringify(ENTWURF_DATEN));
      // Positionen brauchen eine Kennung (wie aus der Datenbank)
      daten.bestellungen.forEach((b) => b.positionen.forEach((p, i) => { p.id = p.id || `${b.id}-p${i}`; }));
    }
  } else {
    let antwort;
    try {
      antwort = await fetch('/api/verwaltung/stand', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    } catch {
      // Meist: Anmeldung abgelaufen, Access leitet auf die Anmeldeseite um
      throw new Error('Keine Verbindung oder Anmeldung abgelaufen – bitte Seite neu laden.');
    }
    const erg = await antwort.json().catch(() => ({}));
    if (!antwort.ok || !erg.ok) throw new Error(erg.error || `Laden fehlgeschlagen (${antwort.status}).`);
    daten = erg;
    zustand.nutzer = erg.nutzer || '';
  }
  if (!daten.chargen.some((c) => c.id === zustand.chargeId)) {
    zustand.chargeId = daten.chargen.length ? daten.chargen[0].id : null;
  }
}

async function senden(pfad, eingabe) {
  let antwort;
  try {
    antwort = await fetch(`/api/verwaltung/${pfad}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(eingabe),
    });
  } catch {
    throw new Error('Nicht gespeichert – keine Verbindung oder Anmeldung abgelaufen. Bitte Seite neu laden.');
  }
  const erg = await antwort.json().catch(() => ({}));
  if (!antwort.ok || !erg.ok) throw new Error(erg.error || `Nicht gespeichert (${antwort.status}).`);
  return erg;
}

/**
 * Speichert eine Änderung: über die Schnittstelle und lädt danach den
 * Stand neu – im Beispielmodus stattdessen beispielAenderung() lokal.
 * Optionen: erfolg (Meldung), neuZeichnen (Standard true), still (keine
 * Sperre für weitere Eingaben, z. B. beim Wiegen).
 * @returns {Promise<object|null>} Ergebnis oder null bei Fehler
 */
async function speichern(pfad, eingabe, beispielAenderung, optionen = {}) {
  const { erfolg, neuZeichnen: zeichnen = true, still = false } = optionen;
  if (beschaeftigt && !still) return null;
  if (!still) {
    beschaeftigt = true;
    document.body.classList.add('vw-beschaeftigt');
  }
  try {
    let erg;
    if (BEISPIEL) {
      erg = beispielAenderung();
    } else {
      erg = await senden(pfad, eingabe);
      await laden();
    }
    if (zeichnen) neuZeichnen();
    if (erfolg) meldung(typeof erfolg === 'function' ? erfolg(erg) : erfolg);
    return erg;
  } catch (fehler) {
    meldung(fehler.message || 'Fehler beim Speichern.');
    return null;
  } finally {
    if (!still) {
      beschaeftigt = false;
      document.body.classList.remove('vw-beschaeftigt');
    }
  }
}

/* ------------------------------------------------------------
   4. BAUSTEINE (wiederkehrende HTML-Teile)
   ------------------------------------------------------------ */
// Bestellrunde: eine kompakte Auswahl oben auf jeder Seite
const CHARGE_KURZ = {
  entwurf: 'In Vorbereitung', stammkunden: 'Nur Stammkunden', offen: 'Offen für Bestellungen',
  geschlossen: 'Bestellschluss vorbei', archiviert: 'Abgeschlossen',
};

function chargeWahl({ alle = false } = {}) {
  const ch = aktiveCharge();
  if (!ch) return '';
  const mitAlle = alle && daten.chargen.length > 1;
  if (mitAlle && zustand.alleRunden) {
    return `<div class="vw-runde"><select class="vw-runde-wahl" data-wahl="charge" aria-label="Bestellrunde wählen">
      <option value="*" selected>Alle laufenden Bestellrunden</option>
      ${daten.chargen.map((c) => `<option value="${c.id}">${esc(c.titel)}</option>`).join('')}</select>
      <span class="vw-klein">${daten.chargen.length} Bestellrunden zusammen</span></div>`;
  }
  const auswahl = daten.chargen.length > 1
    ? `<select class="vw-runde-wahl" data-wahl="charge" aria-label="Bestellrunde wählen">${mitAlle ? '<option value="*">Alle laufenden Bestellrunden</option>' : ''}${daten.chargen
      .map((c) => `<option value="${c.id}" ${c.id === ch.id ? 'selected' : ''}>${esc(c.titel)}</option>`).join('')}</select>`
    : `<strong class="vw-runde-name">${esc(ch.titel)}</strong>`;
  return `<div class="vw-runde">${auswahl}
    <span class="vw-klein">${[CHARGE_KURZ[ch.status], `Bestellschluss ${datumKurz(ch.bestellschluss)}`].filter(Boolean).join(' · ')}</span></div>`;
}

function marken(b) {
  const t = terminVon(b);
  const teile = [];
  if (b.neu) teile.push('<span class="vw-marke vw-marke--neu">neu</span>');
  if (b.status === 'warteliste') teile.push('<span class="vw-marke vw-marke--info">Warteliste</span>');
  if (b.status === 'storniert') teile.push('<span class="vw-marke">storniert</span>');
  if (istHofverkauf(b)) teile.push('<span class="vw-marke">Verkauf am Hof</span>');
  else teile.push(t
    ? `<span class="vw-marke">${t.art === 'abholung' ? 'Abholung' : 'Lieferung'} ${datumKurz(t.datum)}</span>`
    : '<span class="vw-marke vw-marke--offen">Termin offen</span>');
  if (istAktiv(b)) {
    teile.push(b.bezahlt
      ? `<span class="vw-marke vw-marke--gut">bezahlt (${ZAHLARTEN[b.bezahlt]})</span>`
      : `<span class="vw-marke vw-marke--offen">offen · ${ZAHLARTEN[b.zahlart]}</span>`);
    if (b.uebergeben) teile.push('<span class="vw-marke vw-marke--gut">übergeben</span>');
  }
  return `<div class="vw-marken">${teile.join('')}</div>`;
}

// Kurzer Stand einer Bestellung als Text, z. B. „Abholung Sa., 10.10. · bar, offen"
function standText(b) {
  if (b.status === 'storniert') return 'storniert';
  const t = terminVon(b);
  const wo = istHofverkauf(b) ? 'Verkauf am Hof' : t ? `${t.art === 'abholung' ? 'Abholung' : 'Lieferung'} ${datumKurz(t.datum)}` : 'Termin offen';
  if (b.status === 'warteliste') return wo;
  const zahlung = b.bezahlt ? `bezahlt (${ZAHLARTEN[b.bezahlt]})` : `${ZAHLARTEN[b.zahlart]}, offen`;
  return `${wo} · ${b.uebergeben ? 'übergeben · ' : ''}${zahlung}`;
}

function bestellZeile(b) {
  const k = kundeVon(b);
  const grau = !istAktiv(b) || b.uebergeben ? ' vw-zeile--grau' : '';
  const marke = b.neu ? '<span class="vw-marke vw-marke--neu">neu</span> '
    : b.status === 'warteliste' ? '<span class="vw-marke vw-marke--info">Warteliste</span> ' : '';
  const offen = istAktiv(b) && (!terminVon(b) && !istHofverkauf(b));
  return `<button type="button" class="vw-zeile${grau}" data-aktion="oeffnen" data-id="${b.id}">
    <span class="vw-zeile-name">${marke}${esc(k.name)}</span>
    <span class="vw-zeile-betrag">${betragText(bestellBetrag(b))}</span>
    <span class="vw-zeile-info">${esc(artikelKurz(b))}</span>
    <span class="vw-zeile-stand${offen ? ' vw-warnung' : ''}">${esc(standText(b))} · ${esc(b.nummer)}${zustand.alleRunden && aktuelleAnsicht() === 'bestellungen' ? ` · ${esc(chargeVon(b).titel)}` : ''}</span>
  </button>`;
}

function whatsappLink(b, text) {
  const nummer = kundeVon(b).telefon.replace(/[^\d]/g, '');
  return `https://wa.me/${nummer}?text=${encodeURIComponent(text)}`;
}

const vorname = (k) => k.name.split(' ')[0];

function bereitText(b) {
  const k = kundeVon(b);
  const t = terminVon(b);
  if (!t) return bestaetigungText(b);
  const wann = t.art === 'abholung'
    ? `Ihr könnt sie am ${datumKurz(t.datum)} zwischen ${uhrzeit(t.von)} und ${uhrzeit(t.bis)} Uhr bei uns am Hof abholen.`
    : `Wir liefern am ${datumKurz(t.datum)} zwischen ${uhrzeit(t.von)} und ${uhrzeit(t.bis)} Uhr.`;
  return `Hallo ${vorname(k)}, eure Bestellung ${b.nummer} ist fertig: ${artikelKurz(b)}. `
    + `Betrag: ${betragText(bestellBetrag(b))}. ${wann} Liebe Grüße, Kathrin & Florian`;
}

// Für übernommene Voranmeldungen: dabei, Preis nennen, Termin erfragen
function bestaetigungText(b) {
  const ch = chargeVon(b);
  const k = kundeVon(b);
  const preise = b.positionen.map((p) => {
    const a = artikelVon(ch, p.artikelId);
    const preis = preisVon(ch, p);
    return `${p.menge}× ${a.name} (${a.art === 'gewicht' ? `${euro(preis)}/kg` : `je ${euro(preis)}`})`;
  }).join(', ');
  const termine = ch.termine.map((t) => terminText(t)).join(' oder ');
  return `Hallo ${vorname(k)}, ihr hattet euch vorangemeldet – ihr seid dabei: ${preise}. `
    + `Passt euch ${termine}? Und zahlt ihr bar oder per Überweisung? Liebe Grüße, Kathrin & Florian`;
}

// Ankündigung einer Bestellrunde – zum Weiterleiten in WhatsApp-Kanal,
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

const adresseVon = (k) => `${k.strasse}, ${`${k.plz} ${k.ort}`.trim()}`;

function navLink(b) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresseVon(kundeVon(b)))}`;
}

// Route über mehrere Stopps ab dem eigenen Standort. Google Maps nimmt
// höchstens 9 Zwischenstopps – längere Touren werden in Teile geteilt.
function routenLinks(bestellungen) {
  const adressen = bestellungen.map((b) => adresseVon(kundeVon(b)));
  const teile = [];
  for (let i = 0; i < adressen.length; i += 10) teile.push(adressen.slice(i, i + 10));
  return teile.map((teil, n) => {
    const ziel = teil[teil.length - 1];
    const zwischen = teil.slice(0, -1);
    const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(ziel)}`
      + (zwischen.length ? `&waypoints=${encodeURIComponent(zwischen.join('|'))}` : '');
    const von = n * 10 + 1;
    return { url, text: teile.length > 1 ? `Route Stopp ${von}–${von + teil.length - 1}` : `Route in Google Maps (${teil.length} ${teil.length === 1 ? 'Stopp' : 'Stopps'})` };
  });
}

// Zahlungsinfo für Überweisung (WhatsApp-Text und Anzeige mit QR-Code)
function zahlungsText(b) {
  const k = kundeVon(b);
  const bank = daten.bank;
  const betrag = betragText(bestellBetrag(b));
  const gruss = istHofverkauf(b) && k.name.startsWith('Verkauf am Hof') ? 'Hallo' : `Hallo ${vorname(k)}`;
  return bank
    ? `${gruss}, danke für euren Einkauf! Betrag: ${betrag}. Bitte überweisen an ${bank.inhaber}, IBAN ${bank.iban}`
      + `${bank.bic ? `, BIC ${bank.bic}` : ''}, Verwendungszweck: Bestellung ${b.nummer}. Liebe Grüße, Kathrin & Florian`
    : `${gruss}, danke für euren Einkauf! Betrag: ${betrag}, Verwendungszweck: Bestellung ${b.nummer}. Liebe Grüße, Kathrin & Florian`;
}

function zahlungsinfoOeffnen(b) {
  const dialog = document.getElementById('vw-dialog');
  if (!dialog) return;
  const k = kundeVon(b);
  dialog.innerHTML = `<div class="vw-dialog-inhalt">
    <div class="vw-dialog-kopf">
      <div><h2 id="vw-dialog-titel">Zahlungsinfo</h2><span class="vw-klein">${esc(k.name)} · ${esc(b.nummer)}</span></div>
      <button type="button" class="vw-schliessen" data-aktion="schliessen" aria-label="Schließen">×</button>
    </div>
    <p class="vw-gross-betrag">${betragText(bestellBetrag(b))}</p>
    ${daten.bank ? `<div class="vw-zahlungsinfo">${ueberweisungsQr(b, daten.bank, `Bestellung ${b.nummer}`)}
      <p>${esc(daten.bank.inhaber)}<br>IBAN ${esc(daten.bank.iban)}${daten.bank.bic ? `<br>BIC ${esc(daten.bank.bic)}` : ''}<br>
        Verwendungszweck: <strong>Bestellung ${esc(b.nummer)}</strong></p></div>
      <p class="vw-klein">Der Kunde kann den Code mit seiner Banking-App scannen.</p>`
    : '<p class="vw-warnung">Die Bankverbindung ist in Cloudflare noch nicht hinterlegt (BANK_IBAN) – bitte mündlich weitergeben.</p>'}
    <div class="vw-knopfreihe">
      ${k.telefon ? `<a class="vw-knopf vw-knopf--voll" href="${whatsappLink(b, zahlungsText(b))}" target="_blank" rel="noopener">Per WhatsApp schicken</a>` : ''}
      <button type="button" class="vw-knopf" data-aktion="schliessen">Fertig</button>
    </div>
  </div>`;
  delete dialog.dataset.id;
  if (!dialog.open) dialog.showModal();
}

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
    <p class="vw-klein">Eingang wurde dem Kunden automatisch bestätigt. Bestellung ggf. stornieren bzw. Artikel klären,
      bezahlte Beträge innerhalb von 14 Tagen erstatten, dann als erledigt markieren.</p>
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
// Oben nur, was zu tun ist; darunter, was noch frei ist; alles Seltene
// (Bestellrunde bearbeiten, Sortiment, Export …) eingeklappt unter „Mehr".
function ansichtUebersicht() {
  const ch = aktiveCharge();
  const alle = bestellungenDerCharge(ch);
  const aktiv = alle.filter(istAktiv);
  const warteliste = alle.filter((b) => b.status === 'warteliste').length;
  const offen = aktiv.filter((b) => !b.bezahlt);
  const offenCent = offen.reduce((s, b) => s + bestellBetrag(b).cent, 0);
  const nichtUebergeben = aktiv.filter((b) => !b.uebergeben && !ohneTerminOffen(b)).length;
  const geldFehlt = aktiv.filter((b) => b.uebergeben && !b.bezahlt).length;
  const neue = alle.filter((b) => b.neu).length;
  const ohneTermin = aktiv.filter(ohneTerminOffen).length;
  const passendeVa = passendeVoranmeldungen(ch).length;
  const hatGewichtsware = ch.artikel.some((a) => a.art === 'gewicht');

  // Zu tun: nur Einträge mit Anzahl > 0, jeder mit Zahl rechts
  const aufgabe = (anzahl, text, ziel) => (anzahl
    ? `<li>${ziel.startsWith('#') ? `<a href="${ziel}">` : `<button type="button" data-aktion="filter" data-wert="${ziel}">`}
        <span>${text}</span><span class="vw-anzahl">${anzahl}</span>${ziel.startsWith('#') ? '</a>' : '</button>'}</li>`
    : '');
  const aufgaben = [
    aufgabe(neue, 'Neue Bestellungen über die Website', 'neu'),
    aufgabe(ohneTermin, 'Termin mit dem Kunden klären', 'termin-offen'),
    aufgabe(passendeVa, 'Voranmeldungen übernehmen', '#voranmeldungen'),
    aufgabe(warteliste, 'Auf der Warteliste', 'warteliste'),
    aufgabe(nichtUebergeben, 'Noch abzuholen bzw. zu liefern', '#uebergabe'),
    aufgabe(geldFehlt, 'Übergeben, Geld noch nicht da', '#zahlungen'),
  ].join('');

  const freiHtml = ch.artikel.map((a) => {
    const frei = freieMenge(ch, a.id);
    const anteil = a.kontingent ? Math.min(100, Math.round(((a.kontingent - frei) / a.kontingent) * 100)) : 100;
    return `<div class="vw-frei-zeile">
      <span class="vw-frei-name">${esc(a.name)}</span>
      <span class="vw-balken${frei <= 0 ? ' vw-balken--voll' : ''}" aria-hidden="true"><span style="width:${anteil}%"></span></span>
      <strong class="vw-frei-zahl">${frei > 0 ? `${frei} frei` : 'aus'}</strong>
    </div>`;
  }).join('');

  const mehr = (inhaltHtml) => `<li>${inhaltHtml}</li>`;
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Übersicht</h1>${chargeWahl()}</div>
    ${widerrufeKarte()}
    <section class="vw-karte" aria-label="Zu tun"><h2>Zu tun</h2>
      ${aufgaben ? `<ul class="vw-aufgaben">${aufgaben}</ul>` : '<p class="vw-erledigt-hinweis">Alles erledigt ✓</p>'}
      ${aktiv.length && aktiv.every((b) => b.uebergeben && b.bezahlt) && !warteliste
        ? `<p class="vw-klein">Alles übergeben und bezahlt. Abgeschlossene Runden verschwinden aus dem Alltag, bleiben aber in der Auswertung.</p>
          <button type="button" class="vw-knopf vw-knopf--breit" data-aktion="runde-status" data-id="${ch.id}" data-wert="archiviert">Bestellrunde abschließen</button>` : ''}
    </section>
    <div class="vw-kennzahlen vw-kennzahlen--zwei">
      <div class="vw-kennzahl"><strong>${aktiv.length}</strong><span>Bestellungen</span></div>
      <div class="vw-kennzahl${offenCent ? ' vw-kennzahl--achtung' : ''}"><strong>${euro(offenCent)}</strong><span>noch nicht bezahlt</span></div>
    </div>
    <section class="vw-karte" aria-label="Noch frei"><h2>Noch frei</h2>${freiHtml}</section>
    <details class="vw-karte vw-mehr"><summary>Mehr: Bestellrunde, Sortiment, Export …</summary>
      <ul class="vw-aufgaben">
        ${mehr('<a href="#charge">Bestellrunde bearbeiten (Preise, Mengen, Termine)</a>')}
        ${mehr('<a href="#charge-neu">Neue Bestellrunde anlegen</a>')}
        ${mehr('<a href="#sortiment">Sortiment – Produkte anlegen und ändern</a>')}
        ${mehr('<button type="button" data-aktion="ankuendigung">Ankündigung für WhatsApp</button>')}
        ${mehr('<a href="#auswertung">Auswertung für die Buchhaltung (Jahr, Excel)</a>')}
        ${mehr('<button type="button" data-aktion="listen-drucken">Abhol- und Lieferlisten drucken (alle Tage)</button>')}
        ${mehr('<a href="#zahlungen">Alle Zahlungen</a>')}
        ${mehr(hatGewichtsware ? '<a href="#wiegen">Vorab wiegen und Packzettel drucken</a>' : '<button type="button" data-aktion="drucken">Packzettel drucken</button>')}
        ${mehr('<button type="button" data-aktion="export">Liste für Excel herunterladen</button>')}
      </ul>
      <p class="vw-klein">Termine: ${ch.termine.length ? ch.termine.map(terminText).join(' · ') : 'noch keine'}</p>
    </details>
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
  // „Neu" nur anbieten, wenn es etwas Neues gibt
  const filter = FILTER.filter(([wert]) => wert !== 'neu' || anzahl('neu') || zustand.filter === 'neu');
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Bestellungen</h1>${chargeWahl({ alle: true })}
      <div class="vw-such-zeile">
        <input type="search" class="vw-suche" id="vw-suche" placeholder="Suchen …"
          aria-label="Bestellungen durchsuchen" value="${esc(zustand.suche)}" />
        <select class="vw-filter-wahl" data-wahl="filter" aria-label="Anzeigen">${filter.map(([wert, text]) =>
          `<option value="${wert}" ${zustand.filter === wert ? 'selected' : ''}>${text} (${anzahl(wert)})</option>`).join('')}</select>
      </div>
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

// Erfassen: zwei Arten, oben umschaltbar
function erfassenUmschalter(aktiv) {
  return `<div class="vw-segment" role="group" aria-label="Was erfassen?">
    <a href="#neu" aria-pressed="${aktiv === 'neu'}">Vorbestellung</a>
    <a href="#hofverkauf" aria-pressed="${aktiv === 'hof'}">Verkauf am Hof</a>
  </div>`;
}

// 5.3 Bestellung erfassen (Telefon, WhatsApp, persönlich)
function ansichtNeu() {
  const ch = aktiveCharge();
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Erfassen</h1>${erfassenUmschalter('neu')}${chargeWahl()}
      <p class="vw-klein">Bestellung per Telefon, WhatsApp oder persönlich – für einen späteren Termin.
        Ohne Preis und Termin? <a href="#voranmeldungen">Voranmeldung</a>.</p></div>
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
      <label class="vw-feld"><span>E-Mail (optional – für Bestätigungen und „Meine Bestellungen")</span><input name="email" type="email" autocomplete="off" /></label>

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
    .map(([artikelId, menge]) => ({ artikelId, menge }));
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
      bezahlt: null, uebergeben: false, anmerkung: eingabe.anmerkung, positionen,
    };
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

// 5.4 Wiegen
function ansichtWiegen() {
  const ch = aktiveCharge();
  const liste = gewichtsPositionen(ch);
  const fertig = liste.filter((x) => x.p.gewichtG).length;
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Wiegen</h1>${chargeWahl()}
      <p class="vw-klein">Optional – nur nötig, wenn ihr vorab packt, z. B. für die Liefertour oder um Packzettel mit Endbetrag zu drucken.
        Sonst tippt ihr die Gewichte einfach bei der <a href="#uebergabe">Übergabe</a> ein.
        Hier: Gesamtgewicht je Bestellung in kg (z. B. 6,15).</p></div>
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
      }).join('') : '<p class="vw-klein">In dieser Bestellrunde gibt es keine Gewichtsware.</p>'}
      <div class="vw-knopfreihe"><button type="button" class="vw-knopf" data-aktion="drucken">Packzettel drucken</button></div>
    </section>`;
}

function gewichtsZeileText(ch, p) {
  const preis = preisVon(ch, p);
  if (!p.gewichtG) return `${euro(preis)}/kg · noch nicht gewogen`;
  return `${kg(p.gewichtG)} × ${euro(preis)}/kg = ${euro(positionBetrag(ch, p).cent)}`;
}

function gewichtAusFeld(input) {
  const kilo = parseFloat(input.value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(kilo) && kilo > 0 ? Math.round(kilo * 1000) : undefined;
}

function gewichtEintragen(input) {
  const b = bestellungVon(input.dataset.gewicht);
  const p = b.positionen[Number(input.dataset.index)];
  p.gewichtG = gewichtAusFeld(input);
  const ch = chargeVon(b);
  document.getElementById(`betrag-${b.id}-${input.dataset.index}`).textContent = gewichtsZeileText(ch, p);
  input.closest('.vw-wiegen-zeile').classList.toggle('vw-wiegen-zeile--fertig', Boolean(p.gewichtG));
  const liste = gewichtsPositionen(ch);
  const fertig = liste.filter((x) => x.p.gewichtG).length;
  document.getElementById('vw-wiegen-stand').textContent = `${fertig} von ${liste.length}`;
  document.getElementById('vw-wiegen-balken').style.width = `${Math.round((fertig / liste.length) * 100)}%`;
}

// Beim Verlassen des Feldes speichern; die Ansicht bleibt stehen, damit
// man gleich im nächsten Feld weitertippen kann.
async function gewichtSpeichern(input) {
  const b = bestellungVon(input.dataset.gewicht);
  const p = b && b.positionen[Number(input.dataset.index)];
  if (!p) return;
  const gewichtG = gewichtAusFeld(input);
  const erg = await speichern(`bestellung/${b.id}`, { aktion: 'gewicht', positionId: p.id, gewichtG: gewichtG ?? null },
    () => ({}), { neuZeichnen: false, still: true });
  input.classList.toggle('vw-feld--fehler', !erg);
}

// 5.5 Übergabe (Abholung und Liefertour)
// Kathrin tippt beim Kunden die Gewichte vom Etikett ab (ein Feld je Stück),
// der Betrag steht sofort da, und ein Knopf erledigt Übergabe und – bei
// Barzahlung – das Kassieren. Vorab wiegen (Ansicht „Wiegen") ist optional.

// Getippte Stückgewichte einer Position (Text, wie eingegeben)
function stueckTexte(p) {
  const liste = zustand.stueck[p.id] || [];
  return Array.from({ length: p.menge }, (_, i) => liste[i] || '');
}

function grammAusText(text) {
  const kilo = parseFloat(String(text).replace(/\s|kg/gi, '').replace(',', '.'));
  return Number.isFinite(kilo) && kilo > 0 ? Math.round(kilo * 1000) : undefined;
}

// Gewicht für die Abrechnung: alle Stücke getippt → Summe; nichts getippt →
// vorab gewogenes Gewicht; teilweise getippt → noch unvollständig (null)
function wirksamesGewicht(p) {
  const texte = stueckTexte(p);
  const getippt = texte.filter((t) => t.trim());
  if (!getippt.length) return p.gewichtG || null;
  const gramm = texte.map(grammAusText);
  return gramm.every(Boolean) ? gramm.reduce((s, g) => s + g, 0) : null;
}

function uebergabeBetrag(b) {
  const ch = chargeVon(b);
  return b.positionen.reduce((erg, p) => {
    const art = artikelVon(ch, p.artikelId).art;
    const pos = art === 'gewicht' ? { ...p, gewichtG: wirksamesGewicht(p) || undefined } : p;
    const x = positionBetrag(ch, pos);
    return { cent: erg.cent + x.cent, geschaetzt: erg.geschaetzt || x.geschaetzt };
  }, { cent: 0, geschaetzt: false });
}

// Reihenfolge der Liefertour: Ort (Liefergebiet), dann selbst festgelegt,
// dann Straße und Hausnummer
function tourSortieren(liste) {
  const ortRang = (ort) => {
    const i = daten.tourReihenfolge.indexOf(ort);
    return i === -1 ? 99 : i;
  };
  return [...liste].sort((x, y) => {
    const kx = kundeVon(x);
    const ky = kundeVon(y);
    return ortRang(kx.ort) - ortRang(ky.ort)
      || kx.ort.localeCompare(ky.ort, 'de')
      || (kx.tourRang ?? 1e9) - (ky.tourRang ?? 1e9)
      || kx.strasse.localeCompare(ky.strasse, 'de', { numeric: true })
      || kx.name.localeCompare(ky.name, 'de');
  });
}

// Liste: je Kunde eine ruhige Zeile. Antippen öffnet den Kunden allein
// (Ansicht „abgabe") mit Gewichten, Betrag und einem Hauptknopf.
function ansichtUebergabe() {
  const ch = aktiveCharge();
  const aktiv = bestellungenDerCharge(ch).filter(istAktiv);
  const anzahl = (art) => aktiv.filter((b) => terminArt(b) === art && !b.uebergeben).length;
  const lieferung = zustand.uebergabeArt === 'lieferung';
  const termine = ch.termine.filter((t) => t.art === zustand.uebergabeArt);
  // Mehrere Abhol- bzw. Liefertage: nach Tag auswählbar
  if (!termine.some((t) => t.id === zustand.uebergabeTermin)) zustand.uebergabeTermin = null;
  const auswahl = aktiv.filter((b) => terminArt(b) === zustand.uebergabeArt
    && (!zustand.uebergabeTermin || b.terminId === zustand.uebergabeTermin));
  const ohneTermin = aktiv.filter(ohneTerminOffen).length;
  const offenAm = (t) => aktiv.filter((b) => b.terminId === t.id && !b.uebergeben).length;
  const tage = termine.length > 1
    ? `<div class="vw-chips" role="group" aria-label="Tag wählen">
        <button type="button" class="vw-chip" data-aktion="uebergabe-tag" data-wert="" aria-pressed="${!zustand.uebergabeTermin}">Alle Tage</button>
        ${termine.map((t) => `<button type="button" class="vw-chip" data-aktion="uebergabe-tag" data-wert="${t.id}"
          aria-pressed="${zustand.uebergabeTermin === t.id}">${datumKurz(t.datum)} (${offenAm(t)})</button>`).join('')}
      </div>`
    : '';

  const sortiert = lieferung
    ? tourSortieren(auswahl)
    : [...auswahl].sort((x, y) => kundeVon(x).name.localeCompare(kundeVon(y).name, 'de'));
  const offen = sortiert.filter((b) => !b.uebergeben);
  const erledigt = sortiert.filter((b) => b.uebergeben);

  const zeile = (b, extra = '') => {
    const k = kundeVon(b);
    return `<div class="vw-stopp-zeile">
      <button type="button" class="vw-zeile vw-zeile--pfeil" data-aktion="abgabe" data-id="${b.id}">
        <span class="vw-zeile-name">${esc(k.name)}</span>
        <span class="vw-zeile-betrag">${betragText(uebergabeBetrag(b))}</span>
        <span class="vw-zeile-info">${esc(artikelKurz(b))}</span>
        ${lieferung ? `<span class="vw-zeile-stand">${k.strasse ? esc(k.strasse) : '<span class="vw-warnung">Adresse fehlt</span>'}</span>` : ''}
      </button>${extra}</div>`;
  };

  let liste = '';
  if (lieferung) {
    let orte = [...new Set(offen.map((b) => kundeVon(b).ort))];
    liste = orte.map((ort) => {
      const imOrt = offen.filter((b) => kundeVon(b).ort === ort);
      return `<h2 class="vw-ort-titel">${esc(ort)}</h2>${imOrt.map((b, i) => zeile(b, zustand.reihenfolge
        ? `<div class="vw-pfeile">
            <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="tour" data-id="${b.id}" data-wert="-1" ${i ? '' : 'disabled'} aria-label="${esc(kundeVon(b).name)} früher">↑</button>
            <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="tour" data-id="${b.id}" data-wert="1" ${i < imOrt.length - 1 ? '' : 'disabled'} aria-label="${esc(kundeVon(b).name)} später">↓</button>
          </div>` : '')).join('')}`;
    }).join('');
  } else {
    liste = offen.map((b) => zeile(b)).join('');
  }
  if (!offen.length) liste = `<p class="vw-erledigt-hinweis">${erledigt.length ? 'Alles übergeben ✓' : 'Keine Bestellungen.'}</p>`;

  const routen = lieferung && !zustand.reihenfolge ? routenLinks(offen.filter((b) => kundeVon(b).strasse)) : [];
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Übergabe</h1>${chargeWahl()}
      <div class="vw-segment" role="group" aria-label="Abholung oder Lieferung">
        <button type="button" data-aktion="uebergabe-art" data-wert="abholung" aria-pressed="${!lieferung}">Abholung <span class="vw-anzahl">${anzahl('abholung')}</span></button>
        <button type="button" data-aktion="uebergabe-art" data-wert="lieferung" aria-pressed="${lieferung}">Liefertour <span class="vw-anzahl">${anzahl('lieferung')}</span></button>
      </div>
      ${tage || (termine.length ? `<p class="vw-klein">${termine.map(terminText).join(' · ')}</p>` : '')}
      ${ohneTermin ? `<p><button type="button" class="vw-link" data-aktion="filter" data-wert="termin-offen">${ohneTermin} Bestellungen ohne Termin ›</button></p>` : ''}
    </div>
    ${routen.map((r) => `<a class="vw-knopf vw-knopf--voll vw-knopf--breit" href="${r.url}" target="_blank" rel="noopener">${esc(r.text)}</a>`).join('')}
    <div class="vw-liste">${liste}</div>
    ${lieferung && offen.length > 1 ? `<p><button type="button" class="vw-link" data-aktion="reihenfolge">${zustand.reihenfolge ? 'Fertig sortiert' : 'Reihenfolge ändern'}</button></p>` : ''}
    ${!lieferung ? '<p><a class="vw-link" href="#hofverkauf">Kunde ohne Bestellung? Verkauf am Hof ›</a></p>' : ''}
    ${offen.length ? `<p><button type="button" class="vw-link" data-aktion="liste-drucken">${lieferung ? 'Liefertour' : 'Abholliste'} zum Mitnehmen drucken</button>
      <br><span class="vw-klein">Für Orte ohne Internet: Gewichte auf Papier notieren und später hier eintippen.</span></p>` : ''}
    ${erledigt.length ? `<details class="vw-erledigt"><summary>Erledigt (${erledigt.length})</summary>
      <div class="vw-liste">${erledigt.map((b) => `<button type="button" class="vw-zeile vw-zeile--grau vw-zeile--pfeil" data-aktion="abgabe" data-id="${b.id}">
        <span class="vw-zeile-name">✓ ${esc(kundeVon(b).name)}</span>
        <span class="vw-zeile-betrag">${betragText(bestellBetrag(b))}</span>
        <span class="vw-zeile-stand${b.bezahlt ? '' : ' vw-warnung'}">${b.bezahlt ? `bezahlt (${ZAHLARTEN[b.bezahlt]})` : 'Geld noch nicht da'}</span>
      </button>`).join('')}</div></details>` : ''}`;
}

// Ein Kunde bei der Übergabe: Gewichte, Betrag, ein Hauptknopf
function ansichtAbgabe() {
  const b = bestellungVon(zustand.abgabeId);
  if (!b) { location.hash = '#uebergabe'; return; }
  const ch = chargeVon(b);
  const k = kundeVon(b);
  const t = terminVon(b);
  const lieferung = terminArt(b) === 'lieferung';
  const betrag = betragText(uebergabeBetrag(b));
  const zurueck = '<a class="vw-zurueck" href="#uebergabe">‹ Übergabe</a>';
  const kontakt = `<div class="vw-kontakt-zeile">
    ${k.telefon ? `<a href="tel:${esc(k.telefon.replace(/\s/g, ''))}">Anrufen</a>
      <a href="${whatsappLink(b, bereitText(b))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
    ${lieferung && k.strasse ? `<a href="${navLink(b)}" target="_blank" rel="noopener">Navi</a>` : ''}
    <button type="button" class="vw-link" data-aktion="oeffnen" data-id="${b.id}">Details</button>
  </div>`;
  const kopf = `<div class="vw-kopf">${zurueck}<h1>${esc(k.name)}</h1>
    <p class="vw-klein">${esc(b.nummer)}${t ? ` · ${terminText(t)}` : ''}${lieferung && k.strasse ? ` · ${esc(adresseVon(k))}` : ''}</p>
    ${b.anmerkung ? `<p class="vw-hinweis">„${esc(b.anmerkung)}"</p>` : ''}</div>`;

  // Schon übergeben: Stand und das, was noch zu tun sein kann
  if (b.uebergeben) {
    inhalt().innerHTML = `${kopf}
      <section class="vw-karte">
        <p>${esc(artikelKurz(b))}</p>
        <div class="vw-summe"><span>Summe</span><strong>${betragText(bestellBetrag(b))}</strong></div>
        <p class="${b.bezahlt ? '' : 'vw-warnung'}">✓ Übergeben · ${b.bezahlt ? `bezahlt (${ZAHLARTEN[b.bezahlt]})` : 'Geld noch nicht da'}</p>
        ${b.bezahlt ? '' : `<button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit vw-knopf--gross" data-aktion="bezahlt" data-wert="${b.zahlart}" data-id="${b.id}">${b.zahlart === 'bar' ? 'Bar erhalten' : 'Geld ist am Konto'}</button>
          <button type="button" class="vw-link" data-aktion="zahlungsinfo" data-id="${b.id}">Zahlungsinfo mit QR-Code zeigen</button>`}
      </section>
      ${kontakt}
      <p><button type="button" class="vw-link vw-link--leise" data-aktion="uebergeben" data-id="${b.id}">Übergabe rückgängig machen</button></p>`;
    return;
  }

  const dazu = ch.artikel.filter((a) => !b.positionen.some((p) => p.artikelId === a.id) && freieMenge(ch, a.id) > 0);
  const positionen = b.positionen.map((p) => {
    const a = artikelVon(ch, p.artikelId);
    const gewicht = a.art === 'gewicht';
    return `<div class="vw-pos">
      <div class="vw-pos-kopf"><strong>${p.menge}× ${esc(a.name)}</strong>
        <span class="vw-klein">${gewicht ? `${euro(preisVon(ch, p))}/kg` : `je ${euro(preisVon(ch, p))}`}</span></div>
      ${gewicht ? `<div class="vw-stueck">${stueckTexte(p).map((txt, i) => `<input type="text" inputmode="decimal" autocomplete="off"
          placeholder="Stück ${i + 1}" value="${esc(txt)}" data-stueck="${p.id}" data-bestellung="${b.id}" data-nr="${i}"
          aria-label="${esc(a.name)} Stück ${i + 1}, Gewicht in kg" />`).join('')}</div>
        ${p.gewichtG ? `<p class="vw-klein">Vorab gewogen: ${kg(p.gewichtG)} – nur ausfüllen, wenn es andere Stücke werden.</p>` : ''}` : ''}
    </div>`;
  }).join('');
  const hatGewicht = b.positionen.some((p) => artikelVon(ch, p.artikelId).art === 'gewicht');

  let haupt;
  let neben;
  if (b.bezahlt) {
    haupt = `<button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit vw-knopf--gross" data-aktion="abschliessen" data-id="${b.id}" data-wert="">Übergeben (schon bezahlt)</button>`;
    neben = '';
  } else if (b.zahlart === 'ueberweisung') {
    haupt = `<button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit vw-knopf--gross" data-aktion="abschliessen" data-id="${b.id}" data-wert="ueberweisung">Übergeben · zahlt per Überweisung</button>`;
    neben = `<button type="button" class="vw-link" data-aktion="abschliessen" data-id="${b.id}" data-wert="bar">Zahlt doch bar</button>`;
  } else {
    haupt = `<button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit vw-knopf--gross" data-aktion="abschliessen" data-id="${b.id}" data-wert="bar">Übergeben · bar kassiert</button>`;
    neben = `<button type="button" class="vw-link" data-aktion="abschliessen" data-id="${b.id}" data-wert="ueberweisung">Zahlt lieber per Überweisung</button>`;
  }

  inhalt().innerHTML = `${kopf}
    <section class="vw-karte">
      ${hatGewicht ? '<p class="vw-klein">Gewichte vom Etikett eintippen (kg).</p>' : ''}
      ${positionen}
      <details class="vw-aendern"><summary>Menge ändern oder Artikel dazu</summary>
        ${b.positionen.map((p) => {
          const a = artikelVon(ch, p.artikelId);
          return `<div class="vw-pos-kopf vw-pos-aendern"><span>${esc(a.name)}</span>
            <div class="vw-zaehler">
              <button type="button" data-aktion="pos-menge" data-id="${b.id}" data-artikel="${a.id}" data-wert="${p.menge - 1}" aria-label="${esc(a.name)} eins weniger">−</button>
              <output>${p.menge}</output>
              <button type="button" data-aktion="pos-menge" data-id="${b.id}" data-artikel="${a.id}" data-wert="${p.menge + 1}" aria-label="${esc(a.name)} eins mehr">+</button>
            </div></div>`;
        }).join('')}
        ${dazu.length ? `<select class="vw-dazu" data-dazu="${b.id}" aria-label="Artikel dazu">
          <option value="">+ Artikel dazu …</option>
          ${dazu.map((a) => `<option value="${a.id}">${esc(a.name)} (noch ${freieMenge(ch, a.id)} frei)</option>`).join('')}</select>` : ''}
      </details>
      <div class="vw-summe"><span>Summe</span><strong data-betrag="${b.id}">${betrag}</strong></div>
      ${haupt}
      ${neben ? `<p class="vw-mitte">${neben}</p>` : ''}
    </section>
    ${kontakt}`;
  // Erstes leeres Gewichtsfeld gleich bereit zum Tippen
  const erstes = [...inhalt().querySelectorAll('[data-stueck]')].find((f) => !f.value);
  if (erstes && window.matchMedia('(pointer: fine)').matches) erstes.focus();
}

// Betrag in der Karte nach jeder Gewichtseingabe aktualisieren
function stueckEintragen(input) {
  const b = bestellungVon(input.dataset.bestellung);
  if (!b) return;
  const liste = zustand.stueck[input.dataset.stueck] || [];
  liste[Number(input.dataset.nr)] = input.value;
  zustand.stueck[input.dataset.stueck] = liste;
  const text = betragText(uebergabeBetrag(b));
  document.querySelectorAll(`[data-betrag="${b.id}"]`).forEach((el) => { el.textContent = text; });
  input.classList.toggle('vw-feld--fehler', Boolean(input.value.trim()) && !grammAusText(input.value));
}

async function uebergabeAbschliessen(b, zahlung) {
  const ch = chargeVon(b);
  const gewichte = [];
  for (const p of b.positionen) {
    if (artikelVon(ch, p.artikelId).art !== 'gewicht') continue;
    const g = wirksamesGewicht(p);
    if (!g) return meldung(`Bitte bei ${kundeVon(b).name} alle Gewichte eintragen.`);
    if (g !== p.gewichtG) gewichte.push({ positionId: p.id, gewichtG: g });
  }
  const erg = await speichern(`bestellung/${b.id}`, { aktion: 'abschliessen', zahlung: zahlung || null, gewichte }, () => {
    gewichte.forEach((g) => { b.positionen.find((p) => p.id === g.positionId).gewichtG = g.gewichtG; });
    b.uebergeben = true;
    b.neu = false;
    if (zahlung === 'bar' && !b.bezahlt) { b.bezahlt = 'bar'; b.zahlart = 'bar'; }
    if (zahlung === 'ueberweisung') b.zahlart = 'ueberweisung';
    return {};
  }, { erfolg: `${kundeVon(b).name}: übergeben${zahlung === 'bar' ? ' und bar kassiert' : ''}.` });
  if (!erg) return;
  b.positionen.forEach((p) => { delete zustand.stueck[p.id]; });
  // Bei Überweisung gleich die Zahlungsinfo zeigen – zum Scannen oder per WhatsApp.
  // Beim Zurückwechseln zur Liste erst nach dem Seitenwechsel öffnen.
  const aktuell = bestellungVon(b.id);
  const info = zahlung === 'ueberweisung' && aktuell && !aktuell.bezahlt ? aktuell.id : null;
  if (aktuelleAnsicht() === 'abgabe') {
    zustand.zahlungsinfoDanach = info;
    location.hash = '#uebergabe';
  } else if (info) {
    zahlungsinfoOeffnen(aktuell);
  }
}

// Menge eines Artikels ändern bzw. Artikel dazu (bei der Übergabe)
function positionMengeSetzen(b, artikelId, menge) {
  const ch = chargeVon(b);
  const pos = b.positionen.find((p) => p.artikelId === artikelId);
  const alt = pos ? pos.menge : 0;
  if (menge < 0) return;
  if (menge === 0 && b.positionen.length === 1) return meldung('Der letzte Artikel kann nicht entfernt werden – Bestellung stattdessen in den Details stornieren.');
  if (menge > alt && freieMenge(ch, artikelId) < menge - alt) return meldung(`Nicht genug frei – noch ${Math.max(0, freieMenge(ch, artikelId))} verfügbar.`);
  if (pos) delete zustand.stueck[pos.id];
  speichern(`bestellung/${b.id}`, { aktion: 'position', artikelId, menge }, () => {
    if (menge === 0) b.positionen = b.positionen.filter((p) => p !== pos);
    else if (pos) { pos.menge = menge; pos.gewichtG = undefined; } else {
      b.positionen.push({ id: `${b.id}-p${Date.now()}`, artikelId, menge, einzelpreisCent: artikelVon(ch, artikelId).preisCent });
    }
    return {};
  });
}

// Liefertour: Kunde eine Stelle früher (-1) oder später (+1) anfahren
function tourVerschieben(b, richtung) {
  const ch = chargeVon(b);
  const ort = kundeVon(b).ort;
  const imOrt = tourSortieren(bestellungenDerCharge(ch)
    .filter((x) => istAktiv(x) && terminArt(x) === 'lieferung' && kundeVon(x).ort === ort));
  const kunden = [...new Set(imOrt.map((x) => x.kundeId))];
  const offeneKunden = [...new Set(imOrt.filter((x) => !x.uebergeben).map((x) => x.kundeId))];
  const i = offeneKunden.indexOf(b.kundeId);
  const nachbar = offeneKunden[i + richtung];
  if (nachbar == null) return;
  const a = kunden.indexOf(b.kundeId);
  const z = kunden.indexOf(nachbar);
  [kunden[a], kunden[z]] = [kunden[z], kunden[a]];
  speichern('tour', { kundeIds: kunden }, () => {
    kunden.forEach((kid, n) => { daten.kunden.find((k) => k.id === kid).tourRang = (n + 1) * 10; });
    return {};
  });
}

// 5.5a Verkauf am Hof (ohne Vorbestellung)
function hofStueckTexte(artikelId) {
  const menge = zustand.hof.mengen[artikelId] || 0;
  const liste = zustand.hof.stueck[artikelId] || [];
  return Array.from({ length: menge }, (_, i) => liste[i] || '');
}

function hofBetrag(ch) {
  return ch.artikel.reduce((erg, a) => {
    const menge = zustand.hof.mengen[a.id] || 0;
    if (!menge) return erg;
    const gramm = hofStueckTexte(a.id).map(grammAusText);
    const gewichtG = a.art === 'gewicht' && gramm.every(Boolean) ? gramm.reduce((s, g) => s + g, 0) : undefined;
    const x = positionBetrag(ch, { artikelId: a.id, menge, gewichtG });
    return { cent: erg.cent + x.cent, geschaetzt: erg.geschaetzt || x.geschaetzt };
  }, { cent: 0, geschaetzt: false });
}

function ansichtHofverkauf() {
  const ch = aktiveCharge();
  const betrag = betragText(hofBetrag(ch));
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Erfassen</h1>${erfassenUmschalter('hof')}${chargeWahl()}
      <p class="vw-klein">Kunde ohne Vorbestellung: Stücke wählen, Gewichte vom Etikett eintippen, kassieren.</p></div>
    <section class="vw-karte">
      <label class="vw-feld"><span>Name (optional)</span>
        <input id="vw-hof-name" list="vw-kundenliste-hof" autocomplete="off" value="${esc(zustand.hof.name)}" placeholder="leer lassen, wenn unbekannt" /></label>
      <datalist id="vw-kundenliste-hof">${daten.kunden.map((k) => `<option value="${esc(k.name)}">${esc(k.ort)}</option>`).join('')}</datalist>
      ${ch.artikel.filter((a) => freieMenge(ch, a.id) > 0 || zustand.hof.mengen[a.id]).map((a) => {
        const menge = zustand.hof.mengen[a.id] || 0;
        const frei = Math.max(0, freieMenge(ch, a.id));
        return `<div class="vw-pos">
          <div class="vw-pos-kopf">
            <div><strong>${esc(a.name)}</strong><br><span class="vw-klein">${a.art === 'gewicht' ? `${euro(a.preisCent)}/kg` : euro(a.preisCent)} · ${frei} frei</span></div>
            <div class="vw-zaehler">
              <button type="button" data-aktion="hof-menge" data-id="${a.id}" data-wert="${menge - 1}" aria-label="${esc(a.name)} weniger">−</button>
              <output>${menge}</output>
              <button type="button" data-aktion="hof-menge" data-id="${a.id}" data-wert="${menge + 1}" aria-label="${esc(a.name)} mehr">+</button>
            </div>
          </div>
          ${a.art === 'gewicht' && menge ? `<div class="vw-stueck">${hofStueckTexte(a.id).map((t, i) => `<input type="text" inputmode="decimal"
            autocomplete="off" placeholder="kg" value="${esc(t)}" data-hofstueck="${a.id}" data-nr="${i}"
            aria-label="${esc(a.name)} Stück ${i + 1}, Gewicht in kg" />`).join('')}</div>` : ''}
        </div>`;
      }).join('')}
      <div class="vw-summe"><span>Summe</span><strong data-hofbetrag>${betrag}</strong></div>
      <button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit vw-knopf--gross" data-aktion="hof-speichern" data-wert="bar">Verkauft · bar kassiert</button>
      <p class="vw-mitte"><button type="button" class="vw-link" data-aktion="hof-speichern" data-wert="ueberweisung">Zahlt per Überweisung</button></p>
    </section>`;
}

function hofStueckEintragen(input) {
  const liste = zustand.hof.stueck[input.dataset.hofstueck] || [];
  liste[Number(input.dataset.nr)] = input.value;
  zustand.hof.stueck[input.dataset.hofstueck] = liste;
  const text = betragText(hofBetrag(aktiveCharge()));
  document.querySelectorAll('[data-hofbetrag]').forEach((el) => { el.textContent = text; });
  input.classList.toggle('vw-feld--fehler', Boolean(input.value.trim()) && !grammAusText(input.value));
}

async function hofverkaufSpeichern(zahlung) {
  const ch = aktiveCharge();
  const name = (document.getElementById('vw-hof-name') || { value: '' }).value.trim();
  const positionen = [];
  for (const a of ch.artikel) {
    const menge = zustand.hof.mengen[a.id] || 0;
    if (!menge) continue;
    if (menge > freieMenge(ch, a.id)) return meldung(`„${a.name}": nur noch ${Math.max(0, freieMenge(ch, a.id))} frei.`);
    let gewichtG = null;
    if (a.art === 'gewicht') {
      const gramm = hofStueckTexte(a.id).map(grammAusText);
      if (!gramm.every(Boolean)) return meldung(`Bitte bei „${a.name}" alle Gewichte eintragen.`);
      gewichtG = gramm.reduce((s, g) => s + g, 0);
    }
    positionen.push({ artikelId: a.id, menge, gewichtG });
  }
  if (!positionen.length) return meldung('Bitte mindestens einen Artikel wählen.');
  const bekannt = name ? kundeNachName(name) : null;
  const eingabe = { chargeId: ch.id, kundeId: bekannt ? bekannt.id : null, kunde: { name }, positionen, zahlung };

  const erg = await speichern('hofverkauf', eingabe, () => {
    let k = bekannt;
    if (!k) {
      const kName = name || 'Verkauf am Hof (ohne Namen)';
      k = daten.kunden.find((x) => x.name === kName);
      if (!k) {
        k = { id: `k${Date.now()}`, name: kName, telefon: '', strasse: '', plz: '', ort: '', stammkunde: false };
        daten.kunden.push(k);
      }
    }
    const b = {
      id: `b${Date.now()}`, nummer: naechsteNummer(), chargeId: ch.id, kundeId: k.id, quelle: 'persoenlich',
      erstellt: new Date().toISOString().slice(0, 10), status: 'vorgemerkt', terminId: null, zahlart: zahlung,
      bezahlt: zahlung === 'bar' ? 'bar' : null, uebergeben: true, anmerkung: '', interneNotiz: 'Verkauf am Hof',
      positionen: positionen.map((p, i) => ({
        id: `b${Date.now()}-p${i}`, artikelId: p.artikelId, menge: p.menge,
        einzelpreisCent: artikelVon(ch, p.artikelId).preisCent, gewichtG: p.gewichtG || undefined,
      })),
    };
    daten.bestellungen.push(b);
    return { bestellung: { id: b.id, nummer: b.nummer } };
  }, { neuZeichnen: false });
  if (!erg) return;
  zustand.hof = { mengen: {}, stueck: {}, name: '' };
  zeigen();
  meldung(`Verkauft${zahlung === 'bar' ? ' und bar kassiert' : ''}: ${erg.bestellung.nummer}.`);
  const b = bestellungVon(String(erg.bestellung.id));
  if (zahlung === 'ueberweisung' && b) zahlungsinfoOeffnen(b);
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

// 5.7 Voranmeldungen (unverbindlich, für spätere Bestellrunden)

// Saison einer Bestellrunde aus dem Datum des ersten Termins – nur für die
// Vorauswahl beim Übernehmen, lässt sich per Häkchen ändern.
function saisonVon(ch) {
  const datum = ch.termine.map((t) => t.datum).sort()[0] || ch.bestellschluss;
  const [jahr, monat, tag] = datum.split('-').map(Number);
  let zeitraum = 'fruehjahr';
  if (monat >= 6 && monat <= 8) zeitraum = 'sommer';
  else if (monat === 9 || monat === 10) zeitraum = 'herbst';
  else if (monat === 11 && tag <= 20) zeitraum = 'martini';
  else if (monat === 11 || monat === 12) zeitraum = 'weihnachten';
  return { zeitraum, jahr };
}

// Offene Voranmeldungen für Produkte, die in dieser Bestellrunde angeboten werden
function passendeVoranmeldungen(ch) {
  const produkte = new Set(ch.artikel.map((a) => a.produktId));
  return daten.voranmeldungen
    .filter((v) => v.status === 'offen' && produkte.has(v.produktId))
    .sort((x, y) => x.erstellt.localeCompare(y.erstellt));
}

function vorausgewaehlt(v, saison) {
  return v.zeitraum === 'naechste' || (v.zeitraum === saison.zeitraum && v.jahr === saison.jahr);
}

function ansichtVoranmeldungen() {
  const ch = aktiveCharge();
  const saison = ch ? saisonVon(ch) : null;
  const passend = ch ? passendeVoranmeldungen(ch) : [];
  const offen = daten.voranmeldungen.filter((v) => v.status === 'offen');
  const jahr = new Date().getFullYear();

  // Planungsübersicht: Summe je Zeitraum und Produkt
  const gruppen = new Map();
  offen.forEach((v) => {
    const schluessel = zeitraumText(v);
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, new Map());
    const g = gruppen.get(schluessel);
    const eintrag = g.get(v.produktId) || { menge: 0, kunden: new Set() };
    eintrag.menge += v.menge;
    eintrag.kunden.add(v.kundeId);
    g.set(v.produktId, eintrag);
  });
  const planung = [...gruppen].map(([zeitraum, g]) => `
    <div class="vw-artikel-zeile"><strong>${esc(zeitraum)}</strong>
      ${[...g].map(([produktId, e]) => `<div class="vw-zeile-kopf vw-klein">
        <span>${esc(produktVon(produktId).name)}</span><span>${e.menge} Stück · ${e.kunden.size} ${e.kunden.size === 1 ? 'Kunde' : 'Kunden'}</span></div>`).join('')}
    </div>`).join('');

  const vaZeile = (v, mitHaken) => {
    const k = daten.kunden.find((x) => x.id === v.kundeId);
    return `<label class="vw-va-zeile">
      ${mitHaken ? `<input type="checkbox" name="va" value="${v.id}" ${vorausgewaehlt(v, saison) ? 'checked' : ''} />` : ''}
      <span class="vw-va-text"><strong>${esc(k.name)}</strong> · ${v.menge}× ${esc(produktVon(v.produktId).name)}<br>
        <span class="vw-klein">${esc(zeitraumText(v))} · ${QUELLEN[v.quelle]} · gemeldet ${datumKurz(v.erstellt)}${v.notiz ? ` · „${esc(v.notiz)}"` : ''}</span></span>
      <button type="button" class="vw-knopf vw-knopf--warnung vw-knopf--klein" data-aktion="va-absagen" data-id="${v.id}">Absagen</button>
    </label>`;
  };
  const andere = offen.filter((v) => !passend.includes(v));

  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Voranmeldungen</h1>
      <p class="vw-klein">Unverbindlich, noch ohne Preis und Termin. Zählen erst von der Menge ab, wenn sie in eine Bestellrunde übernommen werden – wer sich zuerst gemeldet hat, kommt zuerst dran.</p>
      ${chargeWahl()}</div>
    <div class="vw-spalten">
      ${ch ? `<section class="vw-karte" aria-label="Übernehmen">
        <h2>Passend zu „${esc(ch.titel)}"</h2>
        ${passend.length ? `<p class="vw-klein">Vorausgewählt: „nächste Bestellrunde" und ${esc(ZEITRAEUME[saison.zeitraum])} ${saison.jahr}.</p>
          <div id="vw-va-auswahl">${passend.map((v) => vaZeile(v, true)).join('')}</div>
          <button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit" data-aktion="va-uebernehmen">Ausgewählte als Bestellungen übernehmen</button>`
        : '<p class="vw-klein">Keine offenen Voranmeldungen für die Produkte dieser Bestellrunde.</p>'}
      </section>` : '<section class="vw-karte"><p class="vw-klein">Sobald eine Bestellrunde angelegt ist, lassen sich passende Voranmeldungen hier übernehmen.</p></section>'}
      <div>
        <section class="vw-karte" aria-label="Planung"><h2>Planung: offen vorangemeldet</h2>
          ${planung || '<p class="vw-klein">Keine offenen Voranmeldungen.</p>'}</section>
        <section class="vw-karte" aria-label="Voranmeldung erfassen"><h2>Voranmeldung erfassen</h2>
          <form id="vw-va-formular" novalidate>
            <label class="vw-feld"><span>Name</span>
              <input name="name" list="vw-kundenliste-va" autocomplete="off" required /></label>
            <datalist id="vw-kundenliste-va">${daten.kunden.map((k) => `<option value="${esc(k.name)}">${esc(k.ort)}</option>`).join('')}</datalist>
            <label class="vw-feld"><span>Produkt</span>
              <select name="produkt">${daten.produkte.filter((p) => p.aktiv !== false).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
            <label class="vw-feld"><span>Menge</span><input name="menge" type="number" inputmode="numeric" min="1" value="1" /></label>
            <label class="vw-feld"><span>Für wann?</span>
              <select name="zeitraum">${Object.entries(ZEITRAEUME).map(([wert, text]) => `<option value="${wert}">${text}</option>`).join('')}</select></label>
            <label class="vw-feld" id="vw-va-jahr" hidden><span>Jahr</span>
              <select name="jahr"><option>${jahr}</option><option>${jahr + 1}</option></select></label>
            <fieldset class="vw-feldgruppe"><legend>Wie kam sie?</legend>
              <div class="vw-auswahl vw-auswahl--reihe">
                <label><input type="radio" name="quelle" value="whatsapp" checked /> WhatsApp</label>
                <label><input type="radio" name="quelle" value="telefon" /> Telefon</label>
                <label><input type="radio" name="quelle" value="persoenlich" /> persönlich</label>
              </div></fieldset>
            <label class="vw-feld"><span>Notiz (optional)</span><input name="notiz" autocomplete="off" /></label>
            <button type="submit" class="vw-knopf vw-knopf--voll vw-knopf--breit">Voranmeldung speichern</button>
          </form>
        </section>
        ${andere.length ? `<section class="vw-karte" aria-label="Weitere"><h2>Für spätere Bestellrunden</h2>${andere.map((v) => vaZeile(v, false)).join('')}</section>` : ''}
      </div>
    </div>`;
}

async function voranmeldungSpeichern(form) {
  const name = feld(form, 'name').value.trim();
  const menge = Number(feld(form, 'menge').value);
  const zeitraum = feld(form, 'zeitraum').value;
  if (!name) return meldung('Bitte einen Namen eintragen.');
  if (!Number.isInteger(menge) || menge < 1) return meldung('Bitte eine gültige Menge eintragen.');
  const bekannt = kundeNachName(name);
  const eingabe = {
    kundeId: bekannt ? bekannt.id : null,
    kunde: { name },
    produktId: feld(form, 'produkt').value,
    menge,
    zeitraum,
    jahr: zeitraum === 'naechste' ? null : Number(feld(form, 'jahr').value),
    quelle: form.querySelector('input[name="quelle"]:checked').value,
    notiz: feld(form, 'notiz').value.trim(),
  };
  const text = `${name}, ${menge}× ${produktVon(eingabe.produktId).name} (${zeitraumText(eingabe)})`;
  await speichern('voranmeldung', eingabe, () => {
    let k = bekannt;
    if (!k) {
      k = { id: `k${Date.now()}`, name, telefon: '', strasse: '', plz: '', ort: '', stammkunde: false };
      daten.kunden.push(k);
    }
    daten.voranmeldungen.push({
      ...eingabe, id: `v${Date.now()}`, kundeId: k.id, status: 'offen', erstellt: new Date().toISOString().slice(0, 10),
    });
    return {};
  }, { erfolg: `Vorgemerkt: ${text}.` });
}

// Beispielmodus: gleiche Logik wie voranmeldungenUebernehmen() in
// functions/_lib/hofladen.js – je Kunde eine Bestellung, in Reihenfolge der
// Anmeldung, Rest → Warteliste.
function voranmeldungenUebernehmenBeispiel(ch, ids) {
  const auswahl = passendeVoranmeldungen(ch).filter((v) => ids.includes(v.id));
  const jeKunde = new Map();
  auswahl.forEach((v) => {
    if (!jeKunde.has(v.kundeId)) jeKunde.set(v.kundeId, []);
    jeKunde.get(v.kundeId).push(v);
  });
  const bestellungen = [];
  jeKunde.forEach((liste, kundeId) => {
    const mengen = new Map();
    liste.forEach((v) => {
      const a = ch.artikel.find((x) => x.produktId === v.produktId);
      mengen.set(a.id, (mengen.get(a.id) || 0) + v.menge);
    });
    const positionen = [...mengen].map(([artikelId, menge]) => ({ artikelId, menge }));
    const reicht = positionen.every((p) => freieMenge(ch, p.artikelId) >= p.menge);
    const b = {
      id: `b${Date.now()}${kundeId}`, nummer: naechsteNummer(), chargeId: ch.id, kundeId,
      quelle: liste[0].quelle, erstellt: new Date().toISOString().slice(0, 10),
      status: reicht ? 'vorgemerkt' : 'warteliste', terminId: null, zahlart: 'bar', bezahlt: null,
      uebergeben: false, anmerkung: liste.map((v) => v.notiz).filter(Boolean).join(' '),
      interneNotiz: 'aus Voranmeldung – Termin und Zahlart bestätigen', positionen,
    };
    daten.bestellungen.push(b);
    liste.forEach((v) => { v.status = 'uebernommen'; });
    bestellungen.push(b);
  });
  daten.voranmeldungen = daten.voranmeldungen.filter((v) => v.status === 'offen');
  return { bestellungen };
}

async function voranmeldungenUebernehmen(ids) {
  const ch = aktiveCharge();
  if (!ids.length) return meldung('Bitte mindestens eine Voranmeldung auswählen.');
  const erg = await speichern('voranmeldungen/uebernehmen', { chargeId: ch.id, ids },
    () => voranmeldungenUebernehmenBeispiel(ch, ids), { neuZeichnen: false });
  if (!erg) return;
  const vorgemerkt = erg.bestellungen.filter((b) => b.status === 'vorgemerkt').length;
  const warteliste = erg.bestellungen.length - vorgemerkt;
  zustand.filter = 'termin-offen';
  location.hash = '#bestellungen';
  zeigen();
  meldung(`${erg.bestellungen.length} übernommen: ${vorgemerkt} vorgemerkt${warteliste ? `, ${warteliste} auf der Warteliste (nicht genug frei)` : ''} – jetzt Termine bestätigen.`);
}

// 5.8 Bestellrunde anlegen / bearbeiten
const CHARGE_STATUS = {
  entwurf: 'In Vorbereitung – Kunden sehen sie noch nicht',
  offen: 'Offen – Kunden können bestellen',
  geschlossen: 'Bestellschluss – keine Website-Bestellungen mehr',
  archiviert: 'Abgeschlossen – wird ausgeblendet',
};
// Bereiche des Sortiments kommen aus der Datenbank (daten.bereiche, in
// ihrer Reihenfolge) und werden unter „Sortiment → Bereiche" gepflegt
const bereichName = (id) => ((daten.bereiche || []).find((b) => b.id === id) || {}).name || 'Ohne Bereich';
const bereichRang = (id) => {
  const i = (daten.bereiche || []).findIndex((b) => b.id === id);
  return i < 0 ? 9999 : i;
};
const produkteImBereich = (id) => daten.produkte.filter((p) => p.bereichId === id).length;

// Liste nach Bereichen gruppieren: [[bereich, liste], …], leere entfallen
function nachBereichen(liste, bereichVon) {
  const bereiche = daten.bereiche || [];
  const gruppen = bereiche.map((b) => [b, liste.filter((x) => bereichVon(x) === b.id)]);
  const ohne = liste.filter((x) => !bereiche.some((b) => b.id === bereichVon(x)));
  if (ohne.length) gruppen.push([{ id: null, name: 'Ohne Bereich' }, ohne]);
  return gruppen.filter(([, l]) => l.length);
}
const ARTEN = { gewicht: 'nach Gewicht (Preis pro kg)', stueck: 'Fixpreis je Stück', paket: 'Fixpreis je Paket' };

const centAusText = (wert) => {
  const zahl = parseFloat(String(wert).replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(zahl) && zahl >= 0 ? Math.round(zahl * 100) : null;
};
const textAusCent = (cent) => (cent == null ? '' : (cent / 100).toFixed(2).replace('.', ','));

// Vorschlag für neue Bestellrunden: Werte der letzten Bestellrunde je Produkt, sonst Startpreis
function vorschlagFuer(produkt) {
  if (daten.preisVorschlaege) {
    const v = daten.preisVorschlaege.find((x) => x.produktId === produkt.id);
    if (v) return v;
  }
  const letzte = [...daten.chargen].reverse().flatMap((c) => c.artikel).find((a) => a.produktId === produkt.id);
  return letzte
    ? { preisCent: letzte.preisCent, kontingent: letzte.kontingent, maxProBestellung: letzte.maxProBestellung }
    : { preisCent: produkt.startpreisCent ?? null, kontingent: null, maxProBestellung: null };
}

function chargeFormStarten(neu) {
  const ch = neu ? null : aktiveCharge();
  const morgen = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  zustand.chargeForm = {
    id: ch ? ch.id : null,
    titel: ch ? ch.titel : '',
    bestellschluss: ch ? ch.bestellschluss : morgen,
    status: ch ? ch.status || 'offen' : 'entwurf',
    termine: ch ? ch.termine.map((t) => ({ ...t })) : [],
    // je Produkt: angeboten ja/nein und Werte
    artikel: daten.produkte
      .filter((p) => p.aktiv !== false || (ch && ch.artikel.some((a) => a.produktId === p.id)))
      .map((p) => {
        const vorhanden = ch && ch.artikel.find((a) => a.produktId === p.id);
        const vorschlag = vorhanden || vorschlagFuer(p);
        return {
          produkt: p,
          id: vorhanden ? vorhanden.id : null,
          an: Boolean(vorhanden),
          preis: textAusCent(vorschlag.preisCent),
          kontingent: vorschlag.kontingent ?? '',
          max: vorschlag.maxProBestellung ?? '',
          bestellt: vorhanden ? bestellteMenge(ch, vorhanden.id) : 0,
        };
      }),
  };
}

// Eingaben aus dem Formular in die Arbeitskopie übernehmen (vor jedem Neuzeichnen)
function chargeFormLesen() {
  const form = document.getElementById('vw-charge-formular');
  const f = zustand.chargeForm;
  if (!form || !f) return;
  f.titel = feld(form, 'titel').value;
  f.bestellschluss = feld(form, 'bestellschluss').value;
  f.status = feld(form, 'status').value;
  f.termine = [...form.querySelectorAll('[data-termin]')].map((zeile) => ({
    id: zeile.dataset.termin || null,
    art: zeile.querySelector('[name="t-art"]').value,
    datum: zeile.querySelector('[name="t-datum"]').value,
    von: zeile.querySelector('[name="t-von"]').value,
    bis: zeile.querySelector('[name="t-bis"]').value,
  }));
  form.querySelectorAll('[data-produkt]').forEach((zeile) => {
    const a = f.artikel.find((x) => x.produkt.id === zeile.dataset.produkt);
    a.an = zeile.querySelector('[name="a-an"]').checked;
    a.preis = zeile.querySelector('[name="a-preis"]').value;
    a.kontingent = zeile.querySelector('[name="a-menge"]').value;
    a.max = zeile.querySelector('[name="a-max"]').value;
  });
}

function ansichtCharge(neu) {
  if (!zustand.chargeForm || (neu ? zustand.chargeForm.id : zustand.chargeForm.id !== zustand.chargeId)) {
    if (!neu && !aktiveCharge()) return ansichtLeer();
    chargeFormStarten(neu);
  }
  const f = zustand.chargeForm;
  const gruppen = nachBereichen(f.artikel, (a) => a.produkt.bereichId);
  const statusListe = { ...CHARGE_STATUS };
  if (f.status === 'stammkunden') statusListe.stammkunden = 'Nur Stammkunden';

  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>${f.id ? 'Bestellrunde bearbeiten' : 'Neue Bestellrunde'}</h1>
      <p class="vw-klein">${f.id ? 'Preisänderungen gelten nur für neue Bestellungen.' : 'Preis, Menge und Höchstmenge sind mit den Werten der letzten Bestellrunde vorbelegt.'}</p></div>
    <form id="vw-charge-formular" novalidate>
      <section class="vw-karte">
        <label class="vw-feld"><span>Titel</span><input name="titel" value="${esc(f.titel)}" placeholder="z. B. Masthühner Herbst" required /></label>
        <label class="vw-feld"><span>Bestellschluss</span><input name="bestellschluss" type="date" value="${esc(f.bestellschluss)}" required /></label>
        <label class="vw-feld"><span>Status</span><select name="status">${Object.entries(statusListe).map(([wert, text]) =>
          `<option value="${wert}" ${f.status === wert ? 'selected' : ''}>${text}</option>`).join('')}</select></label>
      </section>
      <section class="vw-karte"><h2>Termine</h2>
        ${f.termine.map((t) => `<div class="vw-termin-zeile" data-termin="${esc(t.id || '')}">
          <select name="t-art" aria-label="Art"><option value="abholung" ${t.art === 'abholung' ? 'selected' : ''}>Abholung</option><option value="lieferung" ${t.art === 'lieferung' ? 'selected' : ''}>Lieferung</option></select>
          <input name="t-datum" type="date" value="${esc(t.datum)}" aria-label="Datum" />
          <input name="t-von" type="time" value="${esc(t.von)}" aria-label="von" />
          <input name="t-bis" type="time" value="${esc(t.bis)}" aria-label="bis" />
          <button type="button" class="vw-knopf vw-knopf--warnung vw-knopf--klein" data-aktion="termin-entfernen" aria-label="Termin entfernen">×</button>
        </div>`).join('') || '<p class="vw-klein">Noch keine Termine.</p>'}
        <div class="vw-knopfreihe">
          <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="termin-dazu" data-wert="abholung">+ Abholtermin</button>
          <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="termin-dazu" data-wert="lieferung">+ Liefertermin</button>
        </div>
      </section>
      <section class="vw-karte"><h2>Was wird angeboten?</h2>
        <p class="vw-klein">Häkchen setzen, Preis (bei Gewichtsware pro kg) und vorhandene Menge eintragen. Höchstmenge pro Bestellung ist optional.
          Fehlt ein Produkt? Im <a href="#sortiment">Sortiment</a> anlegen.</p>
        ${gruppen.map(([b, liste]) => `<h3 class="vw-ort-titel">${esc(b.name)}</h3>
          ${liste.map((a) => `<div class="vw-artikel-form" data-produkt="${a.produkt.id}">
            <label class="vw-artikel-name"><input type="checkbox" name="a-an" ${a.an ? 'checked' : ''} /> ${esc(a.produkt.name)}
              ${a.bestellt ? `<span class="vw-klein"> · ${a.bestellt} bestellt</span>` : ''}</label>
            <label><span class="vw-klein">Preis €${a.produkt.art === 'gewicht' ? '/kg' : ''}</span><input name="a-preis" inputmode="decimal" value="${esc(a.preis)}" /></label>
            <label><span class="vw-klein">Menge</span><input name="a-menge" type="number" inputmode="numeric" min="0" value="${esc(a.kontingent)}" /></label>
            <label><span class="vw-klein">max.</span><input name="a-max" type="number" inputmode="numeric" min="1" value="${esc(a.max)}" placeholder="–" /></label>
          </div>`).join('')}`).join('')}
      </section>
      <div class="vw-knopfreihe">
        <button type="submit" class="vw-knopf vw-knopf--voll">${f.id ? 'Änderungen speichern' : 'Bestellrunde anlegen'}</button>
        <a class="vw-knopf" href="#uebersicht">Abbrechen</a>
      </div>
    </form>`;
}

async function chargeSpeichern() {
  chargeFormLesen();
  const f = zustand.chargeForm;
  if (!f.titel.trim()) return meldung('Bitte einen Titel eintragen.');
  if (!f.bestellschluss) return meldung('Bitte den Bestellschluss eintragen.');
  if (f.termine.some((t) => !t.datum)) return meldung('Bitte bei jedem Termin ein Datum eintragen.');
  const artikel = [];
  for (const a of f.artikel.filter((x) => x.an)) {
    const preisCent = centAusText(a.preis);
    const kontingent = Number(a.kontingent);
    if (preisCent == null) return meldung(`Bitte einen Preis für „${a.produkt.name}" eintragen.`);
    if (a.kontingent === '' || !Number.isInteger(kontingent) || kontingent < 0) return meldung(`Bitte die Menge für „${a.produkt.name}" eintragen.`);
    if (a.bestellt && kontingent < a.bestellt) return meldung(`„${a.produkt.name}": schon ${a.bestellt} bestellt – Menge nicht darunter setzen.`);
    artikel.push({ id: a.id, produktId: a.produkt.id, preisCent, kontingent, maxProBestellung: a.max === '' ? null : Number(a.max) });
  }
  if (!artikel.length) return meldung('Bitte mindestens ein Produkt anbieten.');
  const entfernt = f.artikel.filter((a) => !a.an && a.bestellt);
  if (entfernt.length) return meldung(`„${entfernt[0].produkt.name}" wurde schon bestellt und bleibt in der Bestellrunde.`);

  const eingabe = {
    titel: f.titel.trim(), bestellschluss: f.bestellschluss, status: f.status,
    termine: f.termine.map((t) => ({ id: t.id, art: t.art, datum: t.datum, von: t.von, bis: t.bis })),
    artikel,
  };
  const erg = await speichern(f.id ? `charge/${f.id}` : 'charge', eingabe, () => {
    const id = f.id || `c${Date.now()}`;
    const neueCharge = {
      id, titel: eingabe.titel, bestellschluss: eingabe.bestellschluss, status: eingabe.status,
      termine: eingabe.termine.map((t, i) => ({ ...t, id: t.id || `t${Date.now()}${i}` })),
      artikel: artikel.map((a, i) => {
        const p = produktVon(a.produktId);
        return { id: a.id || `a${Date.now()}${i}`, produktId: a.produktId, name: p.name, art: p.art,
          preisCent: a.preisCent, kontingent: a.kontingent, maxProBestellung: a.maxProBestellung,
          richtVonG: p.richtVonG, richtBisG: p.richtBisG };
      }),
    };
    const index = daten.chargen.findIndex((c) => c.id === id);
    if (index >= 0) daten.chargen[index] = neueCharge; else daten.chargen.push(neueCharge);
    if (eingabe.status === 'archiviert') daten.chargen = daten.chargen.filter((c) => c.id !== id);
    return { chargeId: id };
  }, { neuZeichnen: false });
  if (!erg) return;
  zustand.chargeForm = null;
  if (eingabe.status !== 'archiviert') zustand.chargeId = erg.chargeId;
  else zustand.chargeId = daten.chargen.length ? daten.chargen[0].id : null;
  location.hash = '#uebersicht';
  zeigen();
  const passend = aktiveCharge() ? passendeVoranmeldungen(aktiveCharge()).length : 0;
  meldung(`Bestellrunde gespeichert.${passend ? ` ${passend} Voranmeldungen passen dazu.` : ''}`);
}

// 5.8a Auswertung für die Buchhaltung
// Gezählt wird nach dem Tag der Übergabe – erst dann ist verkauft. Enthält
// auch abgeschlossene Bestellrunden (die Daten kommen deshalb eigens von
// /api/verwaltung/auswertung, nicht aus dem Tagesstand).

// Beispielmodus: dieselbe Form aus den Beispieldaten (übergeben = heute)
function auswertungBeispiel() {
  const jahr = String(new Date().getFullYear());
  const runden = daten.chargen.concat(daten.archiv || []);
  const bestellungen = daten.bestellungen.filter((b) => istAktiv(b) && b.uebergeben).map((b) => {
    const ch = chargeVon(b);
    const positionen = b.positionen.map((p) => {
      const a = artikelVon(ch, p.artikelId);
      const produkt = produktVon(a.produktId) || {};
      return { produkt: a.name, bereich: bereichName(produkt.bereichId), bereichRang: bereichRang(produkt.bereichId), art: a.art, menge: p.menge,
        gewichtG: p.gewichtG || null, cent: positionBetrag(ch, p).cent };
    });
    return { id: b.id, nummer: b.nummer, chargeId: b.chargeId, kunde: kundeVon(b).name, quelle: b.quelle,
      hofverkauf: istHofverkauf(b), zahlart: b.zahlart, bezahlt: b.bezahlt, bezahltAm: b.bezahlt ? new Date().toISOString().slice(0, 10) : null,
      uebergebenAm: new Date().toISOString().slice(0, 10), cent: positionen.reduce((x, p) => x + p.cent, 0), positionen };
  });
  return { jahr, jahre: [jahr], bestellungen, runden: runden.map((c) => ({
    id: c.id, titel: c.titel, status: c.status || 'offen', bestellschluss: c.bestellschluss,
    nichtUebergeben: daten.bestellungen.filter((b) => b.chargeId === c.id && istAktiv(b) && !b.uebergeben).length,
  })) };
}

async function auswertungLaden(jahr) {
  zustand.auswertung = { laedt: true, jahr };
  if (aktuelleAnsicht() === 'auswertung') zeigen();
  try {
    if (BEISPIEL) {
      zustand.auswertung = auswertungBeispiel();
    } else {
      const antwort = await fetch(`/api/verwaltung/auswertung${jahr ? `?jahr=${encodeURIComponent(jahr)}` : ''}`,
        { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const erg = await antwort.json().catch(() => ({}));
      if (!antwort.ok || !erg.ok) throw new Error(erg.error || 'Auswertung konnte nicht geladen werden.');
      zustand.auswertung = erg;
    }
  } catch (fehler) {
    zustand.auswertung = { fehler: fehler.message || 'Keine Verbindung – bitte Seite neu laden.' };
  }
  if (aktuelleAnsicht() === 'auswertung') zeigen();
}

function ansichtAuswertung() {
  const aw = zustand.auswertung;
  if (!aw) { auswertungLaden(null); return; }
  if (aw.laedt) { inhalt().innerHTML = '<div class="vw-kopf"><h1>Auswertung</h1></div><p class="vw-klein">Wird geladen …</p>'; return; }
  if (aw.fehler) {
    inhalt().innerHTML = `<div class="vw-kopf"><h1>Auswertung</h1></div><section class="vw-karte"><p>${esc(aw.fehler)}</p>
      <button type="button" class="vw-knopf" data-aktion="auswertung-neu">Noch einmal versuchen</button></section>`;
    return;
  }
  const summe = (liste) => liste.reduce((x, b) => x + b.cent, 0);
  const bar = aw.bestellungen.filter((b) => b.bezahlt === 'bar');
  const ueberwiesen = aw.bestellungen.filter((b) => b.bezahlt === 'ueberweisung');
  const offen = aw.bestellungen.filter((b) => !b.bezahlt);

  // Je Bereich und je Produkt
  const jeProdukt = new Map();
  aw.bestellungen.forEach((b) => b.positionen.forEach((p) => {
    const e = jeProdukt.get(p.produkt) || { produkt: p.produkt, bereich: p.bereich, bereichRang: p.bereichRang, art: p.art, menge: 0, gramm: 0, cent: 0 };
    e.menge += p.menge;
    e.gramm += p.gewichtG || 0;
    e.cent += p.cent;
    jeProdukt.set(p.produkt, e);
  }));
  const produkte = [...jeProdukt.values()].sort((x, y) => x.bereichRang - y.bereichRang || y.cent - x.cent);
  const bereiche = [...new Set(produkte.map((p) => p.bereich))]
    .map((name) => [name, produkte.filter((p) => p.bereich === name).reduce((x, p) => x + p.cent, 0)])
    .filter(([, cent]) => cent);

  const runden = aw.runden.map((r) => {
    const liste = aw.bestellungen.filter((b) => b.chargeId === r.id);
    const offenCent = summe(liste.filter((b) => !b.bezahlt));
    const fertig = !r.nichtUebergeben && !offenCent;
    return `<div class="vw-runden-zeile">
      <div><strong>${esc(r.titel)}</strong><br>
        <span class="vw-klein">${r.status === 'archiviert' ? 'abgeschlossen' : (CHARGE_KURZ[r.status] || 'laufend')}
        · ${liste.length} übergeben${r.nichtUebergeben ? ` · ${r.nichtUebergeben} noch offen` : ''}${offenCent ? ` · ${euro(offenCent)} nicht bezahlt` : ''}</span></div>
      <strong class="vw-zahl">${euro(summe(liste))}</strong>
      ${r.status === 'archiviert'
        ? `<button type="button" class="vw-link vw-link--leise" data-aktion="runde-status" data-id="${r.id}" data-wert="geschlossen">wieder öffnen</button>`
        : fertig && liste.length ? `<button type="button" class="vw-knopf vw-knopf--klein" data-aktion="runde-status" data-id="${r.id}" data-wert="archiviert">Abschließen</button>` : '<span></span>'}
    </div>`;
  }).join('');

  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Auswertung</h1>
      <div class="vw-runde"><select class="vw-runde-wahl" data-wahl="jahr" aria-label="Jahr">${aw.jahre.map((j) =>
        `<option ${j === aw.jahr ? 'selected' : ''}>${esc(j)}</option>`).join('')}</select>
      <span class="vw-klein">Gezählt nach dem Tag der Übergabe (Abholung, Lieferung, Verkauf am Hof).</span></div></div>
    <div class="vw-kennzahlen vw-kennzahlen--zwei">
      <div class="vw-kennzahl"><strong>${euro(summe(aw.bestellungen))}</strong><span>Umsatz ${esc(aw.jahr)} (${aw.bestellungen.length} Verkäufe)</span></div>
      <div class="vw-kennzahl${offen.length ? ' vw-kennzahl--achtung' : ''}"><strong>${euro(summe(offen))}</strong><span>davon noch nicht bezahlt (${offen.length})</span></div>
      <div class="vw-kennzahl"><strong>${euro(summe(bar))}</strong><span>bar bezahlt</span></div>
      <div class="vw-kennzahl"><strong>${euro(summe(ueberwiesen))}</strong><span>per Überweisung bezahlt</span></div>
    </div>
    <section class="vw-karte"><h2>Nach Bereich</h2>
      ${bereiche.length ? bereiche.map(([name, cent]) => `<div class="vw-zeile-kopf vw-auswertung-zeile"><span>${esc(name)}</span><strong>${euro(cent)}</strong></div>`).join('')
        : '<p class="vw-klein">In diesem Jahr wurde noch nichts übergeben.</p>'}
    </section>
    ${produkte.length ? `<section class="vw-karte"><h2>Nach Produkt</h2>
      <table class="vw-tabelle vw-auswertung-tabelle"><thead><tr><th>Produkt</th><th class="vw-zahl">Menge</th><th class="vw-zahl">kg</th><th class="vw-zahl">Umsatz</th></tr></thead>
      <tbody>${produkte.map((p) => `<tr><td>${esc(p.produkt)}</td><td class="vw-zahl">${p.menge}</td>
        <td class="vw-zahl">${p.art === 'gewicht' ? kgFormat.format(p.gramm / 1000) : ''}</td><td class="vw-zahl">${euro(p.cent)}</td></tr>`).join('')}</tbody></table>
    </section>` : ''}
    <section class="vw-karte"><h2>Bestellrunden</h2>${runden || '<p class="vw-klein">Keine.</p>'}
      <p class="vw-klein">Abgeschlossene Runden verschwinden aus Übersicht, Bestellungen und Übergabe, bleiben hier aber erhalten.</p></section>
    <button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit" data-aktion="auswertung-export" ${aw.bestellungen.length ? '' : 'disabled'}>Für die Buchhaltung herunterladen (Excel)</button>
    <p class="vw-klein">Eine Zeile je verkauftem Artikel mit Datum, Bestellnummer, Kunde, Bereich, Menge, Gewicht, Betrag und Zahlung – zum Weitergeben an die Buchhaltung.
      Die Einordnung für Steuer und Pauschalierung bitte mit der Buchhaltung klären.</p>`;
}

function auswertungExport() {
  const aw = zustand.auswertung;
  const runde = (id) => (aw.runden.find((r) => r.id === id) || {}).titel || '';
  const zeilen = [['Übergabe am', 'Bestellnr.', 'Bestellrunde', 'Kunde', 'Art', 'Bereich', 'Produkt', 'Menge',
    'Gewicht kg', 'Betrag €', 'Zahlart', 'Bezahlt am']];
  aw.bestellungen.forEach((b) => b.positionen.forEach((p) => {
    zeilen.push([b.uebergebenAm, b.nummer, runde(b.chargeId), b.kunde,
      b.hofverkauf ? 'Verkauf am Hof' : `Vorbestellung (${QUELLEN[b.quelle] || b.quelle})`,
      p.bereich, p.produkt, p.menge, p.gewichtG ? p.gewichtG / 1000 : '', p.cent / 100,
      b.bezahlt ? ZAHLARTEN[b.bezahlt] : `offen (${ZAHLARTEN[b.zahlart]})`, b.bezahltAm || '']);
  }));
  csvHerunterladen(zeilen, `hofladen-auswertung-${aw.jahr}.csv`);
}

// Bestellrunde abschließen bzw. wieder öffnen
async function rundeStatus(id, status) {
  const erg = await speichern(`charge/${id}/status`, { status }, () => {
    if (status === 'archiviert') {
      const ch = daten.chargen.find((c) => c.id === id);
      ch.status = 'archiviert';
      daten.archiv = (daten.archiv || []).concat(ch);
      daten.chargen = daten.chargen.filter((c) => c !== ch);
    } else {
      const ch = (daten.archiv || []).find((c) => c.id === id);
      ch.status = status;
      daten.archiv = daten.archiv.filter((c) => c !== ch);
      daten.chargen.push(ch);
    }
    if (!daten.chargen.some((c) => c.id === zustand.chargeId)) zustand.chargeId = daten.chargen.length ? daten.chargen[0].id : null;
    return {};
  }, { neuZeichnen: false, erfolg: status === 'archiviert' ? 'Bestellrunde abgeschlossen – sie bleibt in der Auswertung.' : 'Bestellrunde wieder geöffnet.' });
  if (!erg) return;
  if (aktuelleAnsicht() === 'auswertung') auswertungLaden(zustand.auswertung && zustand.auswertung.jahr);
  else zeigen();
}

// 5.9 Sortiment – Produkte anlegen, ändern, aus- und einblenden
// Ausgeblendete Produkte stehen beim Anlegen einer Bestellrunde nicht zur
// Wahl, alte Bestellungen bleiben unberührt. Gelöscht wird nie.
const kgText = (g) => (g ? kgFormat.format(g / 1000) : '');

function ansichtSortiment() {
  const gruppen = nachBereichen(daten.produkte, (p) => p.bereichId);
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Sortiment</h1>
      <p class="vw-klein">Alle Produkte, die ihr anbieten könnt. Preis und Menge legt ihr je Bestellrunde fest – hier steht nur ein Preisvorschlag.
        Was gerade nicht verkauft wird, einfach ausblenden.</p>
      <div class="vw-knopfreihe">
        <button type="button" class="vw-knopf vw-knopf--voll" data-aktion="produkt-neu">+ Neues Produkt</button>
        <a class="vw-knopf" href="#bereiche">Bereiche bearbeiten</a>
      </div></div>
    ${gruppen.map(([b, liste]) => `<section class="vw-karte"><h2>${esc(b.name)}</h2>
      ${liste.map((p) => `<div class="vw-produkt-zeile${p.aktiv === false ? ' vw-zeile--grau' : ''}">
        <div><strong>${esc(p.name)}</strong>${p.aktiv === false ? ' <span class="vw-marke">ausgeblendet</span>' : ''}<br>
          <span class="vw-klein">${p.art === 'gewicht' ? 'nach Gewicht' : 'Fixpreis'}${p.startpreisCent != null
            ? ` · Vorschlag ${euro(p.startpreisCent)}${p.art === 'gewicht' ? '/kg' : ''}` : ''}${p.allergene ? ` · Allergene: ${esc(p.allergene)}` : ''}</span></div>
        <div class="vw-knopfreihe vw-knopfreihe--klein">
          <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="produkt-bearbeiten" data-id="${p.id}">Bearbeiten</button>
          <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="produkt-aktiv" data-id="${p.id}">${p.aktiv === false ? 'Wieder anbieten' : 'Ausblenden'}</button>
        </div>
      </div>`).join('')}</section>`).join('')}`;
}

function produktFormStarten(id) {
  const p = id ? produktVon(id) : null;
  zustand.produktForm = p
    ? { ...p, preis: textAusCent(p.startpreisCent), von: kgText(p.richtVonG), bis: kgText(p.richtBisG) }
    : { id: null, name: '', art: 'stueck', bereichId: (daten.bereiche[0] || {}).id || '', preis: '', von: '', bis: '', beschreibung: '',
      pflichtangaben: '', allergene: '', aktiv: true, verwendet: false };
}

function ansichtProdukt() {
  const f = zustand.produktForm;
  if (!f) { location.hash = '#sortiment'; return; }
  const arten = f.art === 'paket' ? ARTEN : { gewicht: ARTEN.gewicht, stueck: ARTEN.stueck };
  const artGesperrt = f.id && f.verwendet;
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>${f.id ? 'Produkt bearbeiten' : 'Neues Produkt'}</h1></div>
    <form class="vw-karte" id="vw-produkt-formular" novalidate>
      <label class="vw-feld"><span>Name (so sehen ihn die Kunden)</span>
        <input name="name" value="${esc(f.name)}" placeholder="z. B. Freilandeier 10 Stück" required /></label>
      <label class="vw-feld"><span>Bereich <a class="vw-klein" href="#bereiche">(Bereiche bearbeiten)</a></span><select name="bereichId">${daten.bereiche.map((b) =>
        `<option value="${esc(b.id)}" ${f.bereichId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      <fieldset class="vw-feldgruppe"><legend>Wie wird verkauft?</legend>
        <div class="vw-auswahl">${Object.entries(arten).map(([wert, text]) => `<label>
          <input type="radio" name="art" value="${wert}" ${f.art === wert ? 'checked' : ''} ${artGesperrt && f.art !== wert && (wert === 'gewicht' || f.art === 'gewicht') ? 'disabled' : ''} /> ${text}</label>`).join('')}</div>
        ${artGesperrt ? '<p class="vw-klein">Schon verkauft – zwischen „nach Gewicht" und „Fixpreis" lässt sich nicht mehr wechseln.</p>' : ''}
      </fieldset>
      <div id="vw-richtgewicht" ${f.art === 'gewicht' ? '' : 'hidden'}>
        <p class="vw-klein">Gewicht pro Stück (ungefähr) – damit wird vor dem Wiegen ein „ca."-Preis gezeigt.</p>
        <div class="vw-zwei-felder">
          <label class="vw-feld"><span>von kg</span><input name="von" inputmode="decimal" value="${esc(f.von)}" placeholder="1,8" /></label>
          <label class="vw-feld"><span>bis kg</span><input name="bis" inputmode="decimal" value="${esc(f.bis)}" placeholder="2,4" /></label>
        </div>
      </div>
      <label class="vw-feld"><span>Preisvorschlag in € <span class="vw-klein">(für die erste Bestellrunde; bei Gewicht pro kg)</span></span>
        <input name="preis" inputmode="decimal" value="${esc(f.preis)}" placeholder="z. B. 4,50" /></label>
      <label class="vw-feld"><span>Beschreibung (optional)</span><textarea name="beschreibung" rows="2">${esc(f.beschreibung)}</textarea></label>
      <label class="vw-feld"><span>Zutaten, Füllmenge, Herkunft (bei Lebensmitteln Pflicht)</span><textarea name="pflichtangaben" rows="2">${esc(f.pflichtangaben)}</textarea></label>
      <label class="vw-feld"><span>Allergene (z. B. „Ei, Weizen (Gluten)" – leer, wenn keine)</span><input name="allergene" value="${esc(f.allergene)}" /></label>
      <div class="vw-knopfreihe">
        <button type="submit" class="vw-knopf vw-knopf--voll">${f.id ? 'Speichern' : 'Produkt anlegen'}</button>
        <a class="vw-knopf" href="#sortiment">Abbrechen</a>
      </div>
    </form>`;
}

function produktEingabe(f, aenderung = {}) {
  return {
    name: f.name.trim(), art: f.art, bereichId: f.bereichId, startpreisCent: f.preis === '' ? null : centAusText(f.preis),
    richtVonG: f.art === 'gewicht' ? grammAusText(f.von) : null, richtBisG: f.art === 'gewicht' ? grammAusText(f.bis) : null,
    beschreibung: f.beschreibung, pflichtangaben: f.pflichtangaben, allergene: f.allergene, aktiv: f.aktiv !== false,
    ...aenderung,
  };
}

async function produktSpeichern(form) {
  const f = zustand.produktForm;
  ['name', 'bereichId', 'preis', 'von', 'bis', 'beschreibung', 'pflichtangaben', 'allergene'].forEach((n) => { f[n] = feld(form, n).value; });
  const art = form.querySelector('input[name="art"]:checked');
  f.art = art ? art.value : f.art;
  const eingabe = produktEingabe(f);
  if (!eingabe.name) return meldung('Bitte einen Namen eintragen.');
  if (f.preis !== '' && eingabe.startpreisCent == null) return meldung('Bitte den Preis als Zahl eintragen, z. B. 4,50.');
  if (f.art === 'gewicht' && (!eingabe.richtVonG || !eingabe.richtBisG || eingabe.richtBisG < eingabe.richtVonG)) {
    return meldung('Bitte das ungefähre Gewicht pro Stück eintragen (von – bis).');
  }
  if (daten.produkte.some((p) => p.id !== f.id && p.name.toLowerCase() === eingabe.name.toLowerCase())) {
    return meldung('Ein Produkt mit diesem Namen gibt es schon.');
  }
  const erg = await speichern(f.id ? `produkt/${f.id}` : 'produkt', eingabe, () => {
    const werte = { ...eingabe };
    if (f.id) Object.assign(produktVon(f.id), werte);
    else daten.produkte.push({ id: `p${Date.now()}`, verwendet: false, ...werte });
    return {};
  }, { neuZeichnen: false });
  if (!erg) return;
  zustand.produktForm = null;
  location.hash = '#sortiment';
  zeigen();
  meldung(`„${eingabe.name}" gespeichert.`);
}

function produktAktivUmschalten(p) {
  const f = { ...p, preis: textAusCent(p.startpreisCent), von: kgText(p.richtVonG), bis: kgText(p.richtBisG) };
  const aktiv = p.aktiv === false;
  speichern(`produkt/${p.id}`, produktEingabe(f, { aktiv }), () => { p.aktiv = aktiv; return {}; },
    { erfolg: aktiv ? `„${p.name}" wird wieder angeboten.` : `„${p.name}" ist ausgeblendet.` });
}

// 5.9a Bereiche des Sortiments – anlegen, umbenennen, ordnen, leere löschen
function ansichtBereiche() {
  const liste = daten.bereiche || [];
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Bereiche</h1>
      <p class="vw-klein">So wird das Sortiment gegliedert – hier in der Verwaltung und auf der Hofladen-Seite, in dieser
        Reihenfolge. Löschen lässt sich nur ein leerer Bereich; Produkte ordnet ihr unter „Sortiment → Bearbeiten" um.</p>
      <a class="vw-knopf" href="#sortiment">Zurück zum Sortiment</a></div>
    <section class="vw-karte" aria-label="Bereiche">
      ${liste.map((b, i) => {
        const anzahl = produkteImBereich(b.id);
        return `<form class="vw-bereich-zeile" data-bereich="${esc(b.id)}" novalidate>
          <label class="vw-feld"><span class="vw-klein">${anzahl === 1 ? '1 Produkt' : `${anzahl} Produkte`}</span>
            <input name="name" value="${esc(b.name)}" maxlength="60" aria-label="Name des Bereichs" required /></label>
          <div class="vw-knopfreihe vw-knopfreihe--klein">
            <button type="submit" class="vw-knopf vw-knopf--klein">Umbenennen</button>
            <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="bereich-schieben" data-id="${esc(b.id)}" data-wert="-1"
              aria-label="${esc(b.name)} nach oben" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="bereich-schieben" data-id="${esc(b.id)}" data-wert="1"
              aria-label="${esc(b.name)} nach unten" ${i === liste.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="vw-knopf vw-knopf--klein vw-knopf--warnung" data-aktion="bereich-loeschen" data-id="${esc(b.id)}"
              ${anzahl || liste.length === 1 ? 'disabled' : ''}>Löschen</button>
          </div>
        </form>`;
      }).join('')}
    </section>
    <form class="vw-karte" id="vw-bereich-neu" novalidate><h2>Neuer Bereich</h2>
      <label class="vw-feld"><span>Name (so sehen ihn die Kunden)</span>
        <input name="name" maxlength="60" placeholder="z. B. Eier und Marmelade" required /></label>
      <button type="submit" class="vw-knopf vw-knopf--voll">Bereich anlegen</button>
    </form>
    ${nutzerZeile()}`;
}

function bereichAnlegen(form) {
  const name = feld(form, 'name').value.trim();
  if (!name) return meldung('Bitte einen Namen eintragen.');
  if (daten.bereiche.some((b) => b.name.toLowerCase() === name.toLowerCase())) return meldung('Einen Bereich mit diesem Namen gibt es schon.');
  speichern('bereich', { name }, () => {
    daten.bereiche.push({ id: `b${Date.now()}`, name });
    return {};
  }, { erfolg: `Bereich „${name}" angelegt – jetzt im Sortiment Produkte zuordnen.` });
}

function bereichUmbenennen(form) {
  const b = daten.bereiche.find((x) => x.id === form.dataset.bereich);
  const name = feld(form, 'name').value.trim();
  if (!b) return;
  if (!name) return meldung('Bitte einen Namen eintragen.');
  if (name === b.name) return meldung('Der Name ist unverändert.');
  if (daten.bereiche.some((x) => x !== b && x.name.toLowerCase() === name.toLowerCase())) return meldung('Einen Bereich mit diesem Namen gibt es schon.');
  speichern(`bereich/${b.id}`, { name }, () => { b.name = name; return {}; }, { erfolg: `Umbenannt in „${name}".` });
}

function bereichSchieben(id, richtung) {
  const ids = daten.bereiche.map((b) => b.id);
  const i = ids.indexOf(id);
  const j = i + richtung;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  speichern('bereiche/reihenfolge', { ids }, () => {
    daten.bereiche = ids.map((x) => daten.bereiche.find((b) => b.id === x));
    return {};
  });
}

function bereichLoeschen(id) {
  const b = daten.bereiche.find((x) => x.id === id);
  if (!b || !window.confirm(`Bereich „${b.name}" löschen?`)) return;
  speichern(`bereich/${id}/loeschen`, {}, () => {
    daten.bereiche = daten.bereiche.filter((x) => x.id !== id);
    return {};
  }, { erfolg: `Bereich „${b.name}" gelöscht.` });
}

// Ohne Bestellrunde: freundlicher Hinweis statt leerer Ansichten
function ansichtLeer() {
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Hofladen</h1></div>
    ${widerrufeKarte()}
    <section class="vw-karte">
      <h2>Noch keine laufende Bestellrunde</h2>
      <p>Legt die erste Bestellrunde an – Produkte, Preise und Termine. Voranmeldungen könnt ihr jederzeit erfassen.</p>
      <div class="vw-knopfreihe">
        <a class="vw-knopf vw-knopf--voll" href="#charge-neu">+ Neue Bestellrunde</a>
        <a class="vw-knopf" href="#voranmeldungen">Voranmeldungen</a>
      </div>
    </section>
    ${nutzerZeile()}`;
}

function nutzerZeile() {
  if (BEISPIEL) return '<p class="vw-klein">Beispielmodus – nichts wird gespeichert.</p>';
  return `<p class="vw-klein">${zustand.nutzer ? `Angemeldet als ${esc(zustand.nutzer)} · ` : ''}<a href="/cdn-cgi/access/logout">Abmelden</a></p>`;
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
    const preis = preisVon(ch, p);
    const detail = a.art === 'gewicht'
      ? (p.gewichtG ? `${kg(p.gewichtG)} × ${euro(preis)}/kg` : `${euro(preis)}/kg, noch nicht gewogen`)
      : `je ${euro(preis)}`;
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
    <div class="vw-abschnitt">${marken(b)}
      ${(daten.widerrufe || []).filter((w) => w.bestellungId === b.id).map((w) =>
        `<p class="vw-warnung">Widerruf am ${zeitpunktKurz(w.eingegangen)} Uhr: ${esc(w.umfang)}</p>`).join('')}</div>
    <div class="vw-abschnitt">
      ${t ? `<p><strong>${terminText(t)}</strong></p>` : `<p><strong>Termin noch offen</strong> – mit dem Kunden klären und hier wählen:</p>
        <div class="vw-knopfreihe">${ch.termine.map((x) => `<button type="button" class="vw-knopf" data-aktion="termin-setzen" data-id="${b.id}" data-wert="${x.id}">${terminText(x)}</button>`).join('')}</div>`}
      ${t && t.art === 'lieferung' ? (k.strasse
        ? `<p>${esc(k.strasse)}, ${esc(`${k.plz} ${k.ort}`.trim())}</p>`
        : '<p class="vw-warnung">Lieferadresse fehlt – bitte unter „Kontakt ändern" eintragen.</p>') : ''}
      <p>${k.telefon ? esc(k.telefon) : '<span class="vw-klein">keine Telefonnummer</span>'}${k.email ? `<br><a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : ''}</p>
      <details class="vw-kontakt" ${t && t.art === 'lieferung' && !k.strasse ? 'open' : ''}>
        <summary>Kontakt ändern</summary>
        <form id="vw-kontakt-formular" data-id="${b.id}" novalidate>
          <label class="vw-feld"><span>Telefon</span><input name="telefon" type="tel" value="${esc(k.telefon)}" /></label>
          <label class="vw-feld"><span>E-Mail</span><input name="email" type="email" value="${esc(k.email || '')}" /></label>
          <label class="vw-feld"><span>Straße und Hausnummer</span><input name="strasse" value="${esc(k.strasse)}" /></label>
          <label class="vw-feld"><span>PLZ</span><input name="plz" inputmode="numeric" value="${esc(k.plz)}" /></label>
          <label class="vw-feld"><span>Ort</span><input name="ort" value="${esc(k.ort)}" /></label>
          <button type="submit" class="vw-knopf vw-knopf--voll">Kontakt speichern</button>
        </form>
      </details>
      <div class="vw-knopfreihe">
        ${k.telefon ? `<a class="vw-knopf" href="tel:${esc(k.telefon.replace(/\s/g, ''))}">Anrufen</a>` : ''}
        ${k.telefon ? `<a class="vw-knopf" href="${whatsappLink(b, bereitText(b))}" target="_blank" rel="noopener">${t ? 'WhatsApp „ist fertig"' : 'WhatsApp „Bestätigung"'}</a>` : ''}
        ${t && t.art === 'lieferung' && k.strasse ? `<a class="vw-knopf" href="${navLink(b)}" target="_blank" rel="noopener">Navi</a>` : ''}
      </div>
    </div>
    <div class="vw-abschnitt">
      <table class="vw-tabelle"><tbody>${positionen}</tbody>
        <tfoot><tr><td>Summe</td><td class="vw-zahl">${betragText(summe)}</td></tr></tfoot></table>
      <div class="vw-knopfreihe" role="group" aria-label="Zahlung gewünscht">
        <span class="vw-klein">Zahlung gewünscht:</span>
        ${Object.entries(ZAHLARTEN).map(([wert, text]) => `<button type="button" class="vw-chip" data-aktion="zahlart-setzen" data-id="${b.id}" data-wert="${wert}" aria-pressed="${b.zahlart === wert}">${text}</button>`).join('')}
      </div>
      ${b.anmerkung ? `<p>„${esc(b.anmerkung)}"</p>` : ''}
      ${b.interneNotiz ? `<p class="vw-klein">Intern: ${esc(b.interneNotiz)}</p>` : ''}
    </div>
    <div class="vw-abschnitt vw-knopfreihe">${aktionen}</div>
  </div>`;
  dialog.dataset.id = b.id;
  if (!dialog.open) dialog.showModal();
  if (b.neu) alsGesehenMarkieren([b.id]);
}

// Website-Bestellungen nicht mehr als „neu" zeigen (still im Hintergrund)
function alsGesehenMarkieren(ids) {
  ids.forEach((id) => { const b = bestellungVon(id); if (b) b.neu = false; });
  return speichern('gesehen', { ids }, () => ({}), { neuZeichnen: false, still: true });
}

function kontaktSpeichern(form) {
  const b = bestellungVon(form.dataset.id);
  const k = kundeVon(b);
  const eingabe = { aktion: 'kontakt' };
  ['telefon', 'email', 'strasse', 'plz', 'ort'].forEach((f) => { eingabe[f] = feld(form, f).value.trim(); });
  speichern(`bestellung/${b.id}`, eingabe, () => {
    ['telefon', 'email', 'strasse', 'plz', 'ort'].forEach((f) => { if (eingabe[f]) k[f] = eingabe[f]; });
    return {};
  }, { erfolg: `Kontakt von ${k.name} gespeichert.` });
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
// Zahlen ohne Anführungszeichen mit Dezimalkomma, damit Excel rechnen kann.
// Text, der mit = + - @ beginnt, bekommt ein ' davor (sonst hält Excel ihn
// für eine Formel); Telefonnummern werden als 0043 … geschrieben.
function csvHerunterladen(zeilen, dateiname) {
  const zelle = (v) => {
    if (typeof v === 'number') return String(v).replace('.', ',');
    let text = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = '\ufeff' + zeilen.map((z) => z.map(zelle).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = dateiname;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  meldung('Liste für Excel wurde heruntergeladen.');
}

function exportieren() {
  const ch = aktiveCharge();
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
          t ? (t.art === 'abholung' ? 'Abholung' : 'Lieferung') : (istHofverkauf(b) ? 'Verkauf am Hof' : 'offen'),
          t ? t.datum : '', a.name, p.menge,
          p.gewichtG ? p.gewichtG / 1000 : '', preisVon(ch, p) / 100, a.art === 'gewicht' ? 'kg' : 'Stück',
          betrag.cent / 100, betrag.geschaetzt ? 'ja' : '', ZAHLARTEN[b.zahlart],
          b.bezahlt ? ZAHLARTEN[b.bezahlt] : 'offen', b.uebergeben ? 'ja' : 'nein', b.anmerkung]);
      });
    });
  csvHerunterladen(zeilen, `hofladen-${ch.titel.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-')}.csv`);
}

// Überweisungsdaten auf dem Packzettel (Bankverbindung aus den Cloudflare-
// Einstellungen, siehe README; fehlt sie, erscheint ein Hinweis)
function ueberweisungsBlock(b) {
  const bank = daten.bank;
  if (!bank) return '<p class="vw-packzettel-bank">Bitte überweisen – Bankverbindung ist in Cloudflare noch nicht hinterlegt.</p>';
  const zweck = `Bestellung ${b.nummer}`;
  const text = `<p><strong>Bitte überweisen an:</strong> ${esc(bank.inhaber)}<br>
    IBAN ${esc(bank.iban)}${bank.bic ? ` · BIC ${esc(bank.bic)}` : ''}${bank.bank ? ` · ${esc(bank.bank)}` : ''}<br>
    Verwendungszweck: <strong>${esc(zweck)}</strong></p>`;
  return `<div class="vw-packzettel-bank">${ueberweisungsQr(b, bank, zweck)}${text}</div>`;
}

// QR-Code zum Scannen mit der Banking-App – nur mit genauem Betrag,
// also erst wenn alles Fleisch gewogen ist
function ueberweisungsQr(b, bank, zweck) {
  const betrag = bestellBetrag(b);
  if (betrag.geschaetzt || betrag.cent < 1 || !window.KruckenhausQr) return '';
  try {
    const epc = KruckenhausQr.epcText({ name: bank.inhaber, iban: bank.iban, bic: bank.bic, betragCent: betrag.cent, zweck });
    return `<div class="vw-packzettel-qr">${KruckenhausQr.svg(epc, { titel: `Überweisung ${euro(betrag.cent)}` })}
      <small>Mit der Banking-App scannen</small></div>`;
  } catch {
    return '';
  }
}

/* Abhol- und Lieferlisten zum Ausdrucken – je Termin eine Seite.
   Für Orte ohne Internetempfang (Schlachthaus): Gewichte werden in die
   Kästchen geschrieben und später bei der Übergabe eingetippt. */
function terminListeHtml(ch, t, bestellungen) {
  const lieferung = t && t.art === 'lieferung';
  const liste = lieferung
    ? tourSortieren(bestellungen)
    : [...bestellungen].sort((x, y) => kundeVon(x).name.localeCompare(kundeVon(y).name, 'de'));
  // Summe je Artikel – zum Herrichten
  const summen = ch.artikel.map((a) => [a, liste.reduce((s, b) => s + b.positionen
    .filter((p) => p.artikelId === a.id).reduce((x, p) => x + p.menge, 0), 0)]).filter(([, n]) => n);
  const zeilen = liste.map((b, i) => {
    const k = kundeVon(b);
    const artikel = b.positionen.map((p) => {
      const a = artikelVon(ch, p.artikelId);
      if (a.art !== 'gewicht') return `<div>${p.menge}× ${esc(a.name)} <span class="vw-druck-klein">(${euro(preisVon(ch, p) * p.menge)})</span></div>`;
      if (p.gewichtG) return `<div>${p.menge}× ${esc(a.name)} <span class="vw-druck-klein">gewogen ${kg(p.gewichtG)} × ${euro(preisVon(ch, p))}/kg</span></div>`;
      const kaestchen = Array.from({ length: p.menge }, () => '<span class="vw-druck-kasten"></span>').join('');
      return `<div>${p.menge}× ${esc(a.name)} <span class="vw-druck-klein">${euro(preisVon(ch, p))}/kg</span>
        <div class="vw-druck-kaesten">${kaestchen}<span class="vw-druck-klein">kg</span></div></div>`;
    }).join('');
    const betrag = bestellBetrag(b);
    return `<tr>
      <td class="vw-druck-nr">${lieferung ? i + 1 : '<span class="vw-druck-haken"></span>'}</td>
      <td><strong>${esc(k.name)}</strong><br><span class="vw-druck-klein">${esc(b.nummer)}${k.telefon ? ` · ${esc(k.telefon)}` : ''}</span>
        ${lieferung ? `<br>${esc(adresseVon(k))}` : ''}${b.anmerkung ? `<br><em>„${esc(b.anmerkung)}"</em>` : ''}</td>
      <td>${artikel}</td>
      <td class="vw-druck-betrag">${betrag.geschaetzt ? '<span class="vw-druck-linie"></span> €' : euro(betrag.cent)}</td>
      <td>${b.bezahlt ? 'bezahlt' : `${ZAHLARTEN[b.zahlart]}<br><span class="vw-druck-haken"></span> erhalten`}</td>
    </tr>`;
  }).join('');
  return `<section class="vw-druckliste">
    <h2>${t ? esc(terminText(t)) : 'Ohne Termin'} – ${esc(ch.titel)}</h2>
    <p class="vw-druck-klein">${liste.length} Bestellungen · Herrichten: ${summen.map(([a, n]) => `${n}× ${esc(a.name)}`).join(' · ')}</p>
    <table class="vw-druck-tabelle">
      <thead><tr><th>${lieferung ? 'Nr.' : '✓'}</th><th>Kunde</th><th>Artikel (Gewichte je Stück eintragen)</th><th>Betrag</th><th>Zahlung</th></tr></thead>
      <tbody>${zeilen}</tbody>
    </table>
    <p class="vw-druck-klein">Gedruckt ${new Date().toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })} – später übergeben/kassiert in der Verwaltung nachtragen.</p>
  </section>`;
}

// Druckt die Listen: nur die gerade gewählte Art/den gewählten Tag oder alle Termine
function listenDrucken(nurAuswahl) {
  const ch = aktiveCharge();
  const druck = document.getElementById('vw-druck');
  if (!druck) return;
  const offen = bestellungenDerCharge(ch).filter((b) => istAktiv(b) && !b.uebergeben && !istHofverkauf(b));
  const termine = ch.termine.filter((t) => !nurAuswahl
    || (t.art === zustand.uebergabeArt && (!zustand.uebergabeTermin || t.id === zustand.uebergabeTermin)));
  const teile = termine
    .map((t) => [t, offen.filter((b) => b.terminId === t.id)])
    .filter(([, liste]) => liste.length)
    .map(([t, liste]) => terminListeHtml(ch, t, liste));
  const ohne = offen.filter((b) => !b.terminId);
  if (!nurAuswahl && ohne.length) teile.push(terminListeHtml(ch, null, ohne));
  if (!teile.length) return meldung('Keine offenen Bestellungen zum Drucken.');
  druck.innerHTML = teile.join('');
  window.print();
}

function packzettelDrucken() {
  const ch = aktiveCharge();
  const druck = document.getElementById('vw-druck');
  if (!druck) return;
  druck.innerHTML = bestellungenDerCharge(ch)
    .filter((b) => istAktiv(b) && !istHofverkauf(b))
    .sort((x, y) => kundeVon(x).name.localeCompare(kundeVon(y).name, 'de'))
    .map((b) => {
      const k = kundeVon(b);
      const t = terminVon(b);
      return `<section class="vw-packzettel">
        <h2>${esc(k.name)} – ${esc(b.nummer)}</h2>
        <p>${t ? terminText(t) : 'Termin offen'}${t && t.art === 'lieferung' ? ` · ${esc(k.strasse)}, ${esc(k.ort)}` : ''} · ${esc(k.telefon)}</p>
        <table class="vw-tabelle"><tbody>${b.positionen.map((p) => {
          const a = artikelVon(ch, p.artikelId);
          return `<tr><td>${p.menge}× ${esc(a.name)}</td><td>${p.gewichtG ? kg(p.gewichtG) : ''}</td>
            <td class="vw-zahl">${betragText(positionBetrag(ch, p))}</td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td colspan="2">Summe · ${b.bezahlt ? 'bezahlt' : ZAHLARTEN[b.zahlart]}</td>
          <td class="vw-zahl">${betragText(bestellBetrag(b))}</td></tr></tfoot></table>
        ${!b.bezahlt && b.zahlart === 'ueberweisung' ? ueberweisungsBlock(b) : ''}
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
  hofverkauf: ansichtHofverkauf,
  wiegen: ansichtWiegen,
  uebergabe: ansichtUebergabe,
  abgabe: ansichtAbgabe,
  zahlungen: ansichtZahlungen,
  voranmeldungen: ansichtVoranmeldungen,
  sortiment: ansichtSortiment,
  bereiche: ansichtBereiche,
  auswertung: ansichtAuswertung,
  produkt: ansichtProdukt,
  charge: () => ansichtCharge(false),
  'charge-neu': () => ansichtCharge(true),
};
// Diese Ansichten funktionieren auch ohne laufende Bestellrunde
const OHNE_CHARGE = ['voranmeldungen', 'charge-neu', 'sortiment', 'bereiche', 'produkt', 'auswertung'];

function aktuelleAnsicht() {
  const name = location.hash.slice(1);
  return ANSICHTEN[name] ? name : 'uebersicht';
}

function zeigen() {
  const name = aktuelleAnsicht();
  if (ladeFehler) {
    inhalt().innerHTML = `<section class="vw-karte"><h1>Hofladen-Verwaltung</h1>
      <p>${esc(ladeFehler)}</p>
      <button type="button" class="vw-knopf vw-knopf--voll" data-aktion="neu-laden">Seite neu laden</button></section>`;
  } else if (!daten) {
    inhalt().innerHTML = '<p class="vw-klein">Wird geladen …</p>';
  } else if (!aktiveCharge() && !OHNE_CHARGE.includes(name)) {
    ansichtLeer();
  } else {
    ANSICHTEN[name]();
  }
  const menuepunkt = {
    hofverkauf: 'neu', abgabe: 'uebergabe', produkt: 'sortiment', bereiche: 'sortiment', wiegen: 'uebersicht', zahlungen: 'uebersicht',
    charge: 'uebersicht', 'charge-neu': 'uebersicht',
  }[name] || name;
  document.querySelectorAll('.vw-nav a[data-ansicht]').forEach((a) => {
    if (a.dataset.ansicht === menuepunkt) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function neuZeichnen() {
  // Formulare nicht neu zeichnen, sonst gehen Eingaben verloren
  if (!['neu', 'charge', 'charge-neu', 'produkt'].includes(aktuelleAnsicht())) zeigen();
  dialogAktualisieren();
}

// Änderung an einer Bestellung (Übergabe, Zahlung, Termin …)
function bestellungAendern(b, eingabe, beispielAenderung, erfolg) {
  return speichern(`bestellung/${b.id}`, eingabe, () => { beispielAenderung(); return {}; }, { erfolg });
}

function initKlicks() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-aktion]');
    if (!el) return;
    const b = el.dataset.id ? bestellungVon(el.dataset.id) : null;
    const name = b ? kundeVon(b).name : '';

    switch (el.dataset.aktion) {
      case 'charge':
        zustand.chargeId = el.dataset.id;
        zustand.chargeForm = null;
        zustand.hof = { mengen: {}, stueck: {}, name: '' };
        zeigen();
        break;
      case 'filter':
        zustand.filter = el.dataset.wert;
        if (aktuelleAnsicht() === 'bestellungen') zeigen();
        else location.hash = '#bestellungen';
        break;
      case 'uebergabe-art':
        zustand.uebergabeArt = el.dataset.wert;
        zustand.reihenfolge = false;
        zeigen();
        break;
      case 'oeffnen':
        detailOeffnen(el.dataset.id);
        break;
      case 'schliessen':
        document.getElementById('vw-dialog').close();
        break;
      case 'uebergeben': {
        const wert = !b.uebergeben;
        bestellungAendern(b, { aktion: 'uebergeben', wert }, () => { b.uebergeben = wert; },
          wert ? `${name}: übergeben.` : 'Rückgängig gemacht.');
        break;
      }
      case 'bezahlt': {
        const art = el.dataset.wert || null;
        bestellungAendern(b, { aktion: 'bezahlt', art }, () => { b.bezahlt = art; },
          art ? `${name}: bezahlt (${ZAHLARTEN[art]}).` : 'Zahlung zurückgesetzt.');
        break;
      }
      case 'stornieren':
        bestellungAendern(b, { aktion: 'stornieren' }, () => { b.status = 'storniert'; },
          (erg) => `${b.nummer} storniert.${erg && erg.mail ? ' Kunde per E-Mail informiert.' : ''}`);
        break;
      case 'wiederherstellen':
      case 'nachruecken': {
        const ch = chargeVon(b);
        speichern(`bestellung/${b.id}`, { aktion: 'nachruecken' }, () => {
          const reicht = b.positionen.every((p) => freieMenge(ch, p.artikelId) >= p.menge);
          b.status = reicht ? 'vorgemerkt' : 'warteliste';
          return { bestellung: { status: b.status } };
        }, {
          erfolg: (erg) => (erg.bestellung.status === 'vorgemerkt'
            ? `${name} ist jetzt vorgemerkt.${erg.mail ? ' Kunde per E-Mail informiert.' : ''}`
            : 'Nicht genug frei – bleibt auf der Warteliste.'),
        });
        break;
      }
      case 'termin-setzen': {
        const terminId = el.dataset.wert;
        const t = chargeVon(b).termine.find((x) => x.id === terminId);
        bestellungAendern(b, { aktion: 'termin', terminId }, () => { b.terminId = terminId; }, `${name}: ${terminText(t)}.`);
        break;
      }
      case 'zahlart-setzen': {
        const zahlart = el.dataset.wert;
        bestellungAendern(b, { aktion: 'zahlart', zahlart }, () => { b.zahlart = zahlart; });
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
      case 'va-uebernehmen': {
        const ids = [...document.querySelectorAll('#vw-va-auswahl input[name="va"]:checked')].map((i) => i.value);
        voranmeldungenUebernehmen(ids);
        break;
      }
      case 'va-absagen': {
        e.preventDefault();
        const id = el.dataset.id;
        speichern(`voranmeldung/${id}/absagen`, {}, () => {
          daten.voranmeldungen = daten.voranmeldungen.filter((v) => v.id !== id);
          return {};
        }, { erfolg: 'Voranmeldung abgesagt.' });
        break;
      }
      case 'widerruf-erledigt': {
        const id = el.dataset.id;
        speichern(`widerruf/${id}/erledigt`, {}, () => {
          daten.widerrufe = daten.widerrufe.filter((w) => w.id !== id);
          return {};
        }, { erfolg: 'Widerruf erledigt.' });
        break;
      }
      case 'termin-dazu':
        chargeFormLesen();
        zustand.chargeForm.termine.push({ id: null, art: el.dataset.wert, datum: '', von: el.dataset.wert === 'abholung' ? '09:00' : '14:00', bis: el.dataset.wert === 'abholung' ? '12:00' : '18:00' });
        ANSICHTEN[aktuelleAnsicht()]();
        break;
      case 'termin-entfernen': {
        chargeFormLesen();
        const zeilen = [...document.querySelectorAll('#vw-charge-formular [data-termin]')];
        zustand.chargeForm.termine.splice(zeilen.indexOf(el.closest('[data-termin]')), 1);
        ANSICHTEN[aktuelleAnsicht()]();
        break;
      }
      case 'drucken':
        packzettelDrucken();
        break;
      case 'alle-gesehen':
        alsGesehenMarkieren(bestellungenDerCharge().filter((x) => x.neu).map((x) => x.id)).then(() => {
          zustand.filter = 'alle';
          zeigen();
          meldung('Alle als gesehen markiert.');
        });
        break;
      case 'abgabe':
        zustand.abgabeId = el.dataset.id;
        location.hash = '#abgabe';
        break;
      case 'runde-status':
        rundeStatus(el.dataset.id, el.dataset.wert);
        break;
      case 'auswertung-export':
        auswertungExport();
        break;
      case 'auswertung-neu':
        auswertungLaden(null);
        break;
      case 'uebergabe-tag':
        zustand.uebergabeTermin = el.dataset.wert || null;
        zeigen();
        break;
      case 'liste-drucken':
        listenDrucken(true);
        break;
      case 'listen-drucken':
        listenDrucken(false);
        break;
      case 'reihenfolge':
        zustand.reihenfolge = !zustand.reihenfolge;
        zeigen();
        break;
      case 'abschliessen':
        uebergabeAbschliessen(b, el.dataset.wert || null);
        break;
      case 'pos-menge':
        positionMengeSetzen(b, el.dataset.artikel, Number(el.dataset.wert));
        break;
      case 'tour':
        tourVerschieben(b, Number(el.dataset.wert));
        break;
      case 'zahlungsinfo':
        zahlungsinfoOeffnen(b);
        break;
      case 'hof-menge': {
        const ch = aktiveCharge();
        const menge = Math.max(0, Number(el.dataset.wert));
        if (menge > freieMenge(ch, el.dataset.id)) {
          meldung(`Nur noch ${Math.max(0, freieMenge(ch, el.dataset.id))} frei.`);
          break;
        }
        zustand.hof.mengen[el.dataset.id] = menge;
        ansichtHofverkauf();
        break;
      }
      case 'hof-speichern':
        hofverkaufSpeichern(el.dataset.wert);
        break;
      case 'produkt-neu':
      case 'produkt-bearbeiten':
        produktFormStarten(el.dataset.aktion === 'produkt-neu' ? null : el.dataset.id);
        if (aktuelleAnsicht() === 'produkt') zeigen();
        else location.hash = '#produkt';
        break;
      case 'produkt-aktiv':
        produktAktivUmschalten(produktVon(el.dataset.id));
        break;
      case 'bereich-schieben':
        bereichSchieben(el.dataset.id, Number(el.dataset.wert));
        break;
      case 'bereich-loeschen':
        bereichLoeschen(el.dataset.id);
        break;
      case 'neu-laden':
        location.reload();
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
    } else if (e.target.dataset.stueck) {
      stueckEintragen(e.target);
    } else if (e.target.dataset.hofstueck) {
      hofStueckEintragen(e.target);
    } else if (e.target.id === 'vw-hof-name') {
      zustand.hof.name = e.target.value;
    } else if (e.target.name === 'name' && e.target.form && e.target.form.id === 'vw-formular') {
      kundeVorschlagen(e.target.value);
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.dataset.gewicht) gewichtSpeichern(e.target);
    if (e.target.name === 'termin') adresseUmschalten();
    if (e.target.dataset.wahl === 'charge') {
      zustand.alleRunden = e.target.value === '*';
      if (zustand.alleRunden) { zeigen(); return; }
      zustand.chargeId = e.target.value;
      zustand.chargeForm = null;
      zustand.hof = { mengen: {}, stueck: {}, name: '' };
      zeigen();
    }
    if (e.target.dataset.wahl === 'jahr') {
      auswertungLaden(e.target.value);
    }
    if (e.target.dataset.wahl === 'filter') {
      zustand.filter = e.target.value;
      zeigen();
    }
    if (e.target.dataset.dazu && e.target.value) {
      positionMengeSetzen(bestellungVon(e.target.dataset.dazu), e.target.value, 1);
    }
    if (e.target.name === 'art' && e.target.form && e.target.form.id === 'vw-produkt-formular') {
      document.getElementById('vw-richtgewicht').hidden = e.target.value !== 'gewicht';
    }
    if (e.target.name === 'zeitraum') {
      const jahr = document.getElementById('vw-va-jahr');
      if (jahr) jahr.hidden = e.target.value === 'naechste';
    }
  });

  document.addEventListener('submit', (e) => {
    const id = e.target.id;
    if (id === 'vw-kontakt-formular') {
      e.preventDefault();
      kontaktSpeichern(e.target);
      return;
    }
    if (id === 'vw-produkt-formular') {
      e.preventDefault();
      produktSpeichern(e.target);
      return;
    }
    if (id === 'vw-bereich-neu' || e.target.classList.contains('vw-bereich-zeile')) {
      e.preventDefault();
      if (id === 'vw-bereich-neu') bereichAnlegen(e.target);
      else bereichUmbenennen(e.target);
      return;
    }
    if (!['vw-va-formular', 'vw-formular', 'vw-charge-formular'].includes(id)) return;
    e.preventDefault();
    if (id === 'vw-va-formular') voranmeldungSpeichern(e.target);
    else if (id === 'vw-formular') bestellungSpeichern(e.target);
    else chargeSpeichern();
  });

  // Klick auf den Hintergrund schließt den Dialog
  const dialog = document.getElementById('vw-dialog');
  if (dialog) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }
}

async function initDaten() {
  const hinweis = document.getElementById('vw-beispiel-hinweis');
  if (hinweis) hinweis.hidden = !BEISPIEL;
  zeigen();
  try {
    await laden();
  } catch (fehler) {
    ladeFehler = fehler.message;
  }
  zeigen();
}

document.addEventListener('DOMContentLoaded', () => {
  initKlicks();
  initEingaben();
  window.addEventListener('hashchange', () => {
    zustand.chargeForm = null;
    if (aktuelleAnsicht() !== 'produkt') zustand.produktForm = null;
    if (aktuelleAnsicht() === 'auswertung') zustand.auswertung = null;
    const dialog = document.getElementById('vw-dialog');
    if (dialog && dialog.open) dialog.close();
    if (zustand.zahlungsinfoDanach) {
      const b = bestellungVon(zustand.zahlungsinfoDanach);
      zustand.zahlungsinfoDanach = null;
      if (b) setTimeout(() => zahlungsinfoOeffnen(b), 0);
    }
    zeigen();
    window.scrollTo(0, 0);
  });
  initDaten();
});
