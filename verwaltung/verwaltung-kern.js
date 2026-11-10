/* ============================================================
 * HOFLADEN-VERWALTUNG – KERN
 * ============================================================
 * Zustand, Helfer (Formatierung, Escaping), Daten und Berechnungen,
 * Laden/Speichern und wiederkehrende HTML-Bausteine (Abschnitte 1–4).
 * Teil von verwaltung/ – Reihenfolge und Überblick: siehe Kopf von verwaltung.js.
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
  aendernOffen: null,      // Bestellung, deren „Menge ändern" aufgeklappt ist
  kundenImport: null,
  vaBearbeiten: null,      // ID der Vormerkung, die gerade bearbeitet wird      // Vorschau „Kunden übernehmen" (Bertha-Seite)
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
  detailMehr: null,          // Bestellung, deren „Mehr" im Detail-Dialog aufgeklappt ist
  nurOhneEinstufung: false,  // Sortiment: nur Produkte ohne Herkunft bzw. USt-Satz zeigen
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

// Uhrzeit nur, wenn von und bis gesetzt sind; Hinweis (z. B. „genauer Tag folgt“) dahinter
function terminText(t) {
  const art = t.art === 'abholung' ? 'Abholung' : 'Lieferung';
  const zeit = t.von && t.bis ? `, ${uhrzeit(t.von)}–${uhrzeit(t.bis)} Uhr` : '';
  return `${art} ${datumKurz(t.datum)}${zeit}${t.hinweis ? ` (${t.hinweis})` : ''}`;
}

const QUELLEN = { web: 'Website', whatsapp: 'WhatsApp', telefon: 'Telefon', persoenlich: 'persönlich' };
const ZAHLARTEN = { bar: 'bar', ueberweisung: 'Überweisung' };
// Einstufung je Produkt für Steuer und SVS (gleiche Begriffe wie in Bertha)
const HERKUNFT = { urprodukt: 'Urprodukt', verarbeitung: 'Be- und Verarbeitung', zukauf: 'Zukauf (Handelsware)' };
const ustSaetze = () => daten.ustSaetze || [4.9, 10, 13, 20];
const satzText = (satz) => `${String(satz).replace('.', ',')} %`;
// „Urprodukt · 10 % USt" bzw. „nicht eingestuft"
const einstufungText = (herkunft, satz) => (herkunft || satz != null
  ? [herkunft ? HERKUNFT[herkunft] : 'Herkunft offen', satz != null ? `${satzText(satz)} USt` : 'USt-Satz offen'].join(' · ')
  : 'nicht eingestuft');
// Bestellungen aus dem Bertha-Kundenportal kommen als 'web' an
const quelleText = (b) => (b.ueberBertha ? 'Bertha-Portal' : QUELLEN[b.quelle] || b.quelle);
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
// Dauersortiment ohne Termin: Abholung am Hof nach Absprache
const terminArt = (b) => (terminVon(b) ? terminVon(b).art : istDauer(chargeVon(b)) ? 'abholung' : null);
const produktVon = (id) => daten.produkte.find((p) => p.id === id);
const bestellungVon = (id) => daten.bestellungen.find((b) => b.id === id);

const bestellungenDerCharge = (ch = aktiveCharge()) =>
  daten.bestellungen.filter((b) => b.chargeId === ch.id);

const istAktiv = (b) => b.status === 'vorgemerkt';
const istDauer = (ch) => Boolean(ch && ch.art === 'dauer');
// Verkauf am Hof ohne Vorbestellung: kein Termin, gleich übergeben
const istHofverkauf = (b) => !b.terminId && b.interneNotiz === 'Verkauf am Hof';
// Ohne Termin und noch zu klären (übernommene Voranmeldungen)
const ohneTerminOffen = (b) => istAktiv(b) && !terminVon(b) && !istHofverkauf(b) && !istDauer(chargeVon(b));

function bestellteMenge(ch, artikelId) {
  return bestellungenDerCharge(ch)
    .filter(istAktiv)
    .reduce((summe, b) => summe + b.positionen
      .filter((p) => p.artikelId === artikelId)
      .reduce((s, p) => s + p.menge, 0), 0);
}

// Dauersortiment: keine Mengen – „frei" ist, was nicht ausverkauft ist
const DAUER_FREI = 999;
function freieMenge(ch, artikelId) {
  if (istDauer(ch)) {
    const p = produktVon(artikelVon(ch, artikelId).produktId);
    return p && p.verkaufsart === 'dauer' && p.verfuegbar !== false && p.aktiv !== false ? DAUER_FREI : 0;
  }
  return artikelVon(ch, artikelId).kontingent - bestellteMenge(ch, artikelId);
}

// „noch 3 frei" – beim Dauersortiment nur „verfügbar" bzw. „ausverkauft"
function freiText(ch, artikelId) {
  const frei = Math.max(0, freieMenge(ch, artikelId));
  if (istDauer(ch)) return frei ? 'verfügbar' : 'ausverkauft';
  return `noch ${frei} frei`;
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
      dauersortimentBeispiel();
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
    <span class="vw-klein">${istDauer(ch) ? 'Immer erhältlich, ohne Bestellschluss'
      : [CHARGE_KURZ[ch.status], `Bestellschluss ${datumKurz(ch.bestellschluss)}`].filter(Boolean).join(' · ')}</span></div>`;
}

// Reiter einer Bestellrunde: alles, was zu einer Runde gehört, an einer Stelle
// (Bestellungen, Übergabe, Zahlungen, Bearbeiten) – direkt unter der Rundenauswahl.
function rundenReiter(aktiv) {
  const ch = aktiveCharge();
  if (!ch || zustand.alleRunden) return '';
  const reiter = [
    ['bestellungen', 'Bestellungen'],
    ['uebergabe', 'Übergabe'],
    ['zahlungen', 'Zahlungen'],
    istDauer(ch) ? ['sortiment', 'Sortiment'] : ['charge', 'Bearbeiten'],
  ];
  return `<nav class="vw-reiter" aria-label="Bereiche dieser Bestellrunde">${reiter.map(([ziel, text]) =>
    `<a href="#${ziel}"${ziel === aktiv ? ' aria-current="page"' : ''}>${text}</a>`).join('')}</nav>`;
}

function marken(b) {
  const t = terminVon(b);
  const teile = [];
  if (b.neu) teile.push('<span class="vw-marke vw-marke--neu">neu</span>');
  if (b.ueberBertha) teile.push('<span class="vw-marke vw-marke--info">über Bertha</span>');
  if (b.status === 'warteliste') teile.push('<span class="vw-marke vw-marke--info">Warteliste</span>');
  if (b.status === 'storniert') teile.push('<span class="vw-marke">storniert</span>');
  if (istHofverkauf(b)) teile.push('<span class="vw-marke">Verkauf am Hof</span>');
  else teile.push(t
    ? `<span class="vw-marke">${t.art === 'abholung' ? 'Abholung' : 'Lieferung'} ${datumKurz(t.datum)}</span>`
    : istDauer(chargeVon(b)) ? '<span class="vw-marke">Abholung nach Absprache</span>'
      : '<span class="vw-marke vw-marke--offen">Termin offen</span>');
  if (istAktiv(b)) {
    teile.push(b.bezahlt
      ? `<span class="vw-marke vw-marke--gut">bezahlt (${ZAHLARTEN[b.bezahlt]})</span>`
      : `<span class="vw-marke vw-marke--offen">offen · ${ZAHLARTEN[b.zahlart]}</span>`);
    if (b.uebergeben) teile.push('<span class="vw-marke vw-marke--gut">übergeben</span>');
  }
  return `<div class="vw-marken">${teile.join('')}</div>`;
}

// Stand einer Bestellung als Marken für die Liste: wann/wie, Zahlung, übergeben.
// Ruhiger als im Dialog: „offen" nur umrandet, erledigt gefüllt.
function standMarken(b) {
  if (b.status === 'storniert') return '<span class="vw-marke">storniert</span>';
  const t = terminVon(b);
  const teile = [];
  if (istHofverkauf(b)) teile.push('<span class="vw-marke">Verkauf am Hof</span>');
  else if (t) teile.push(`<span class="vw-marke">${t.art === 'abholung' ? 'Abholung' : 'Lieferung'} ${datumKurz(t.datum)}</span>`);
  else if (istDauer(chargeVon(b))) teile.push('<span class="vw-marke">Abholung nach Absprache</span>');
  else teile.push('<span class="vw-marke vw-marke--rand">Termin offen</span>');
  if (b.status === 'warteliste') return teile.join('');
  teile.push(b.bezahlt
    ? `<span class="vw-marke vw-marke--gut">bezahlt · ${ZAHLARTEN[b.bezahlt]}</span>`
    : `<span class="vw-marke vw-marke--rand">offen · ${ZAHLARTEN[b.zahlart]}</span>`);
  if (b.uebergeben) teile.push('<span class="vw-marke vw-marke--gut">übergeben</span>');
  return teile.join('');
}

function bestellZeile(b) {
  const k = kundeVon(b);
  const grau = !istAktiv(b) || b.uebergeben ? ' vw-zeile--grau' : '';
  const marke = b.neu ? '<span class="vw-marke vw-marke--neu">neu</span> '
    : b.status === 'warteliste' ? '<span class="vw-marke vw-marke--info">Warteliste</span> ' : '';
  return `<button type="button" class="vw-zeile${grau}" data-aktion="oeffnen" data-id="${b.id}">
    <span class="vw-zeile-name">${marke}${esc(k.name)}</span>
    <span class="vw-zeile-betrag">${betragText(bestellBetrag(b))}</span>
    <span class="vw-zeile-info">${esc(artikelKurz(b))}</span>
    <span class="vw-zeile-stand vw-zeile-stand--marken">${standMarken(b)}<span class="vw-zeile-nummer">${esc(b.nummer)}${zustand.alleRunden && aktuelleAnsicht() === 'bestellungen' ? ` · ${esc(chargeVon(b).titel)}` : ''}</span></span>
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
  if (!t && istDauer(chargeVon(b))) {
    return `Hallo ${vorname(k)}, eure Bestellung ${b.nummer} liegt bereit: ${artikelKurz(b)}. `
      + `Betrag: ${betragText(bestellBetrag(b))}. Wann passt es euch, sie bei uns am Hof abzuholen? Liebe Grüße, Kathrin & Florian`;
  }
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
  return `Hallo ${vorname(k)}, ihr hattet euch vormerken lassen – ihr seid dabei: ${preise}. `
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
