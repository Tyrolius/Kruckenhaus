/* ============================================================
 * HOFLADEN-VERWALTUNG – VORMERKUNGEN, BESTELLRUNDE, AUSWERTUNG
 * ============================================================
 * Abschnitte 5.7–5.8a.
 * Teil von verwaltung/ – Reihenfolge und Überblick: siehe Kopf von verwaltung.js.
 * ============================================================ */

'use strict';

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
    if (zustand.vaBearbeiten === v.id) return vaBearbeitenFormular(v, k);
    return `<label class="vw-va-zeile">
      ${mitHaken ? `<input type="checkbox" name="va" value="${v.id}" ${vorausgewaehlt(v, saison) ? 'checked' : ''} />` : ''}
      <span class="vw-va-text"><strong>${esc(k.name)}</strong> · ${v.menge}× ${esc(produktVon(v.produktId).name)}<br>
        <span class="vw-klein">${esc(zeitraumText(v))} · ${QUELLEN[v.quelle]} · gemeldet ${datumKurz(v.erstellt)}${v.notiz ? ` · „${esc(v.notiz)}"` : ''}</span></span>
      <span class="vw-va-knoepfe">
        <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="va-bearbeiten" data-id="${v.id}">Bearbeiten</button>
        <button type="button" class="vw-knopf vw-knopf--warnung vw-knopf--klein" data-aktion="va-absagen" data-id="${v.id}">Absagen</button>
      </span>
    </label>`;
  };
  const andere = offen.filter((v) => !passend.includes(v));

  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Vormerkungen</h1>
      <p class="vw-klein">Unverbindlich, noch ohne Preis und Termin. Zählen erst von der Menge ab, wenn sie in eine Bestellrunde übernommen werden – wer sich zuerst gemeldet hat, kommt zuerst dran.</p>
      ${chargeWahl()}
      <p><a class="vw-knopf vw-knopf--voll" href="#vormerken">+ Vormerkung erfassen</a></p></div>
    <div class="vw-spalten">
      ${ch ? `<section class="vw-karte" aria-label="Übernehmen">
        <h2>Passend zu „${esc(ch.titel)}"</h2>
        ${passend.length ? `<p class="vw-klein">Vorausgewählt: „nächste Bestellrunde" und ${esc(ZEITRAEUME[saison.zeitraum])} ${saison.jahr}.</p>
          <div id="vw-va-auswahl">${passend.map((v) => vaZeile(v, true)).join('')}</div>
          <button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit" data-aktion="va-uebernehmen">Ausgewählte als Bestellungen übernehmen</button>`
        : '<p class="vw-klein">Keine offenen Vormerkungen für die Produkte dieser Bestellrunde.</p>'}
      </section>` : '<section class="vw-karte"><p class="vw-klein">Sobald eine Bestellrunde angelegt ist, lassen sich passende Vormerkungen hier übernehmen.</p></section>'}
      <div>
        ${andere.length ? `<section class="vw-karte" aria-label="Weitere"><h2>Für spätere Bestellrunden</h2>${andere.map((v) => vaZeile(v, false)).join('')}</section>` : ''}
        <section class="vw-karte" aria-label="Planung"><h2>Planung: offen vorgemerkt</h2>
          ${planung || '<p class="vw-klein">Keine offenen Vormerkungen.</p>'}</section>
      </div>
    </div>`;
}

// 5.7a Vormerkung erfassen – dritte Art unter „Erfassen"
function ansichtVormerken() {
  const jahr = new Date().getFullYear();
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Erfassen</h1>${erfassenUmschalter('vormerken')}
      <p class="vw-klein">Unverbindlich für eine spätere Bestellrunde, noch ohne Preis und Termin.
        <a href="#voranmeldungen">Alle Vormerkungen ›</a></p></div>
    <form class="vw-karte" id="vw-va-formular" novalidate>
      <label class="vw-feld"><span>Name</span>
        <input name="name" list="vw-kundenliste-va" autocomplete="off" required placeholder="Name eintippen – bekannte Kunden werden vorgeschlagen" /></label>
      <datalist id="vw-kundenliste-va">${daten.kunden.map((k) => `<option value="${esc(k.name)}">${esc(k.ort)}</option>`).join('')}</datalist>
      <label class="vw-feld"><span>Produkt</span>
        <select name="produkt">${daten.produkte.filter((p) => p.aktiv !== false).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <div class="vw-zwei-felder">
        <label class="vw-feld"><span>Menge</span><input name="menge" type="number" inputmode="numeric" min="1" value="1" /></label>
        <label class="vw-feld"><span>Für wann?</span>
          <select name="zeitraum">${Object.entries(ZEITRAEUME).map(([wert, text]) => `<option value="${wert}">${text}</option>`).join('')}</select></label>
      </div>
      <label class="vw-feld" id="vw-va-jahr" hidden><span>Jahr</span>
        <select name="jahr"><option>${jahr}</option><option>${jahr + 1}</option></select></label>
      <fieldset class="vw-feldgruppe"><legend>Wie kam sie?</legend>
        <div class="vw-auswahl vw-auswahl--reihe">
          <label><input type="radio" name="quelle" value="whatsapp" checked /> WhatsApp</label>
          <label><input type="radio" name="quelle" value="telefon" /> Telefon</label>
          <label><input type="radio" name="quelle" value="persoenlich" /> persönlich</label>
        </div></fieldset>
      <label class="vw-feld"><span>Notiz (optional)</span><input name="notiz" autocomplete="off" /></label>
      <button type="submit" class="vw-knopf vw-knopf--voll vw-knopf--breit">Vormerkung speichern</button>
    </form>`;
}

// Eine offene Vormerkung ändern: Produkt, Menge, Zeitraum, Notiz.
// Kunde und Quelle bleiben (anderer Kunde = absagen und neu erfassen).
function vaBearbeitenFormular(v, k) {
  const jahr = new Date().getFullYear();
  const jahre = [...new Set([jahr, jahr + 1, v.jahr].filter(Boolean))].sort();
  return `<form class="vw-va-bearbeiten" id="vw-va-bearbeiten" data-id="${esc(v.id)}" novalidate>
      <p><strong>${esc(k ? k.name : '')}</strong> <span class="vw-klein">· ${QUELLEN[v.quelle]} · gemeldet ${datumKurz(v.erstellt)}</span></p>
      <label class="vw-feld"><span>Produkt</span>
        <select name="produkt">${daten.produkte.filter((p) => p.aktiv !== false || p.id === v.produktId).map((p) =>
          `<option value="${p.id}" ${p.id === v.produktId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <div class="vw-zwei-felder">
        <label class="vw-feld"><span>Menge</span><input name="menge" type="number" inputmode="numeric" min="1" value="${v.menge}" /></label>
        <label class="vw-feld"><span>Für wann?</span>
          <select name="va-zeitraum">${Object.entries(ZEITRAEUME).map(([wert, text]) =>
            `<option value="${wert}" ${v.zeitraum === wert ? 'selected' : ''}>${text}</option>`).join('')}</select></label>
      </div>
      <label class="vw-feld" data-va-jahr ${v.zeitraum === 'naechste' ? 'hidden' : ''}><span>Jahr</span>
        <select name="jahr">${jahre.map((j) => `<option ${j === (v.jahr || jahr) ? 'selected' : ''}>${j}</option>`).join('')}</select></label>
      <label class="vw-feld"><span>Notiz (optional)</span><input name="notiz" value="${esc(v.notiz || '')}" autocomplete="off" /></label>
      <div class="vw-knopfreihe">
        <button type="submit" class="vw-knopf vw-knopf--voll">Änderung speichern</button>
        <button type="button" class="vw-knopf" data-aktion="va-bearbeiten-abbrechen">Abbrechen</button>
      </div>
    </form>`;
}

async function vormerkungAendern(form) {
  const id = form.dataset.id;
  const v = daten.voranmeldungen.find((x) => x.id === id);
  if (!v) return;
  const menge = Number(feld(form, 'menge').value);
  if (!Number.isInteger(menge) || menge < 1 || menge > 999) return meldung('Bitte eine gültige Menge eintragen.');
  const zeitraum = feld(form, 'va-zeitraum').value;
  const eingabe = {
    produktId: feld(form, 'produkt').value,
    menge,
    zeitraum,
    jahr: zeitraum === 'naechste' ? null : Number(feld(form, 'jahr').value),
    notiz: feld(form, 'notiz').value.trim(),
  };
  // Formular erst nach erfolgreichem Speichern schließen – bei einem Fehler
  // bleibt das Eingetippte stehen
  const erg = await speichern(`voranmeldung/${id}`, eingabe, () => {
    Object.assign(v, eingabe);
    return {};
  }, { neuZeichnen: false });
  if (!erg) return;
  zustand.vaBearbeiten = null;
  ansichtVoranmeldungen();
  meldung('Vormerkung geändert.');
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
  const erg = await speichern('voranmeldung', eingabe, () => {
    let k = bekannt;
    if (!k) {
      k = { id: `k${Date.now()}`, name, telefon: '', strasse: '', plz: '', ort: '', stammkunde: false };
      daten.kunden.push(k);
    }
    daten.voranmeldungen.push({
      ...eingabe, id: `v${Date.now()}`, kundeId: k.id, status: 'offen', erstellt: new Date().toISOString().slice(0, 10),
    });
    return {};
  }, { neuZeichnen: false });
  if (!erg) return;
  location.hash = '#voranmeldungen';
  meldung(`Vorgemerkt: ${text}.`);
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
      uebergeben: false, anmerkung: liste.map((v) => v.notiz).filter(Boolean).join(' · '),
      interneNotiz: 'aus Vormerkung – Termin und Zahlart bestätigen', positionen,
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
  if (!ids.length) return meldung('Bitte mindestens eine Vormerkung auswählen.');
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
    imPortal: ch ? ch.imPortal !== false : true,
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
  f.imPortal = feld(form, 'imPortal').checked;
  f.termine = [...form.querySelectorAll('[data-termin]')].map((zeile) => ({
    id: zeile.dataset.termin || null,
    art: zeile.querySelector('[name="t-art"]').value,
    datum: zeile.querySelector('[name="t-datum"]').value,
    von: zeile.querySelector('[name="t-von"]').value,
    bis: zeile.querySelector('[name="t-bis"]').value,
    hinweis: zeile.querySelector('[name="t-hinweis"]').value.trim(),
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
  if (!neu && istDauer(aktiveCharge())) {
    inhalt().innerHTML = `<div class="vw-kopf"><h1>Dauersortiment</h1></div>
      <section class="vw-karte"><p>Das Dauersortiment ist immer offen und hat keinen Bestellschluss. Welche Artikel dazugehören,
        was sie kosten und ob sie ausverkauft sind, legt ihr im Sortiment fest (Produkt bearbeiten → „Dauerartikel").</p>
        <div class="vw-knopfreihe"><a class="vw-knopf vw-knopf--voll" href="#sortiment">Zum Sortiment</a>
        <a class="vw-knopf" href="#uebersicht">Zurück</a></div></section>`;
    return;
  }
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
      ${f.id ? `${chargeWahl()}${rundenReiter('charge')}` : ''}
      <p class="vw-klein">${f.id ? 'Preisänderungen gelten nur für neue Bestellungen.' : 'Preis, Menge und Höchstmenge sind mit den Werten der letzten Bestellrunde vorbelegt.'}</p></div>
    <form id="vw-charge-formular" novalidate>
      <section class="vw-karte">
        <label class="vw-feld"><span>Titel</span><input name="titel" value="${esc(f.titel)}" placeholder="z. B. Masthühner Herbst" required /></label>
        <label class="vw-feld"><span>Bestellschluss</span><input name="bestellschluss" type="date" value="${esc(f.bestellschluss)}" required /></label>
        <label class="vw-feld"><span>Status</span><select name="status">${Object.entries(statusListe).map(([wert, text]) =>
          `<option value="${wert}" ${f.status === wert ? 'selected' : ''}>${text}</option>`).join('')}</select></label>
        <label class="vw-haken"><input type="checkbox" name="imPortal" ${f.imPortal ? 'checked' : ''} />
          Auch im Bertha-Portal anbieten (für Eierkunden)</label>
      </section>
      <section class="vw-karte"><h2>Termine</h2>
        ${f.termine.map((t) => `<div class="vw-termin-zeile" data-termin="${esc(t.id || '')}">
          <select name="t-art" aria-label="Art"><option value="abholung" ${t.art === 'abholung' ? 'selected' : ''}>Abholung</option><option value="lieferung" ${t.art === 'lieferung' ? 'selected' : ''}>Lieferung</option></select>
          <input name="t-datum" type="date" value="${esc(t.datum)}" aria-label="Datum" />
          <input name="t-von" type="time" value="${esc(t.von)}" aria-label="von" />
          <input name="t-bis" type="time" value="${esc(t.bis)}" aria-label="bis" />
          <button type="button" class="vw-knopf vw-knopf--warnung vw-knopf--klein" data-aktion="termin-entfernen" aria-label="Termin entfernen">×</button>
          <input name="t-hinweis" class="vw-termin-hinweis" value="${esc(t.hinweis || '')}" maxlength="200"
            placeholder="Hinweis (optional), z. B. genauer Tag folgt" aria-label="Hinweis für Kunden" />
        </div>`).join('') || '<p class="vw-klein">Noch keine Termine.</p>'}
        <p class="vw-klein">Genauer Tag oder Uhrzeit noch offen? Voraussichtlichen Tag eintragen, Uhrzeit leer lassen und einen
          Hinweis dazuschreiben. Später ändern: Bestellungen wandern mit, die Kunden bitte selbst kurz informieren.</p>
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
    titel: f.titel.trim(), bestellschluss: f.bestellschluss, status: f.status, imPortal: f.imPortal,
    termine: f.termine.map((t) => ({ id: t.id, art: t.art, datum: t.datum, von: t.von, bis: t.bis, hinweis: t.hinweis || '' })),
    artikel,
  };
  const erg = await speichern(f.id ? `charge/${f.id}` : 'charge', eingabe, () => {
    const id = f.id || `c${Date.now()}`;
    const neueCharge = {
      id, titel: eingabe.titel, bestellschluss: eingabe.bestellschluss, status: eingabe.status, imPortal: eingabe.imPortal,
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
  meldung(`Bestellrunde gespeichert.${passend ? ` ${passend} Vormerkungen passen dazu.` : ''}`);
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
        gewichtG: p.gewichtG || null, cent: positionBetrag(ch, p).cent,
        herkunft: produkt.herkunft || null, ustSatz: produkt.ustSatz ?? null };
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

  // Je Einstufung und USt-Satz: Preise sind Bruttopreise (inkl. USt)
  const jeSteuer = new Map();
  aw.bestellungen.forEach((b) => b.positionen.forEach((p) => {
    const schluessel = `${p.herkunft || ''}|${p.ustSatz ?? ''}`;
    const e = jeSteuer.get(schluessel) || { herkunft: p.herkunft, ustSatz: p.ustSatz, cent: 0 };
    e.cent += p.cent;
    jeSteuer.set(schluessel, e);
  }));
  const steuer = [...jeSteuer.values()].map((e) => ({ ...e, ...ustAnteil(e.cent, e.ustSatz) }))
    .sort((x, y) => (x.herkunft || 'zz').localeCompare(y.herkunft || 'zz') || (x.ustSatz ?? 99) - (y.ustSatz ?? 99));
  const warenCent = steuer.reduce((x, e) => x + e.cent, 0);
  const lieferCent = summe(aw.bestellungen) - warenCent;
  const offenEingestuft = steuer.some((e) => !e.herkunft || e.ustSatz == null);

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
    ${steuer.length ? `<section class="vw-karte"><h2>Nach Einstufung und USt-Satz</h2>
      <table class="vw-tabelle vw-auswertung-tabelle"><thead><tr><th>Einstufung</th><th class="vw-zahl">Brutto</th><th class="vw-zahl">Netto</th><th class="vw-zahl">USt</th></tr></thead>
      <tbody>${steuer.map((e) => `<tr${!e.herkunft || e.ustSatz == null ? ' class="vw-warnung"' : ''}><td>${esc(einstufungText(e.herkunft, e.ustSatz))}</td>
        <td class="vw-zahl">${euro(e.cent)}</td><td class="vw-zahl">${e.ustSatz != null ? euro(e.nettoCent) : ''}</td>
        <td class="vw-zahl">${e.ustSatz != null ? euro(e.ustCent) : ''}</td></tr>`).join('')}
        ${lieferCent ? `<tr><td>Liefergebühren</td><td class="vw-zahl">${euro(lieferCent)}</td><td></td><td></td></tr>` : ''}</tbody></table>
      <p class="vw-klein">Preise sind Bruttopreise. Es zählt der Satz zum Zeitpunkt der Bestellung.${offenEingestuft
        ? ' Rot = Produkt noch nicht (ganz) eingestuft – im Sortiment Einstufung und USt-Satz eintragen.' : ''}${lieferCent
        ? ' Liefergebühren folgen als Nebenleistung dem Satz der gelieferten Ware.' : ''}</p>
    </section>` : ''}
    ${produkte.length ? `<section class="vw-karte"><h2>Nach Produkt</h2>
      <table class="vw-tabelle vw-auswertung-tabelle"><thead><tr><th>Produkt</th><th class="vw-zahl">Menge</th><th class="vw-zahl">kg</th><th class="vw-zahl">Umsatz</th></tr></thead>
      <tbody>${produkte.map((p) => `<tr><td>${esc(p.produkt)}</td><td class="vw-zahl">${p.menge}</td>
        <td class="vw-zahl">${p.art === 'gewicht' ? kgFormat.format(p.gramm / 1000) : ''}</td><td class="vw-zahl">${euro(p.cent)}</td></tr>`).join('')}</tbody></table>
    </section>` : ''}
    <section class="vw-karte"><h2>Bestellrunden</h2>${runden || '<p class="vw-klein">Keine.</p>'}
      <p class="vw-klein">Abgeschlossene Runden verschwinden aus Übersicht, Bestellungen und Übergabe, bleiben hier aber erhalten.</p></section>
    <button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit" data-aktion="auswertung-export" ${aw.bestellungen.length ? '' : 'disabled'}>Für die Buchhaltung herunterladen (Excel)</button>
    <p class="vw-klein">Eine Zeile je verkauftem Artikel mit Datum, Bestellnummer, Kunde, Bereich, Menge, Gewicht, Betrag und Zahlung – zum Weitergeben an die Buchhaltung.
      Mit Einstufung, USt-Satz, Netto und USt je Zeile.</p>`;
}

// Bruttobetrag → Netto und USt (auf Cent gerundet; Netto = Brutto − USt)
function ustAnteil(bruttoCent, satz) {
  if (satz == null) return { nettoCent: bruttoCent, ustCent: 0 };
  const ustCent = Math.round((bruttoCent * satz) / (100 + satz));
  return { nettoCent: bruttoCent - ustCent, ustCent };
}

function auswertungExport() {
  const aw = zustand.auswertung;
  const runde = (id) => (aw.runden.find((r) => r.id === id) || {}).titel || '';
  const zeilen = [['Übergabe am', 'Bestellnr.', 'Bestellrunde', 'Kunde', 'Art', 'Bereich', 'Produkt', 'Menge',
    'Gewicht kg', 'Betrag €', 'Einstufung', 'USt %', 'Netto €', 'USt €', 'Zahlart', 'Bezahlt am']];
  aw.bestellungen.forEach((b) => b.positionen.forEach((p) => {
    const anteil = ustAnteil(p.cent, p.ustSatz);
    zeilen.push([b.uebergebenAm, b.nummer, runde(b.chargeId), b.kunde,
      b.hofverkauf ? 'Verkauf am Hof' : `Vorbestellung (${quelleText(b)})`,
      p.bereich, p.produkt, p.menge, p.gewichtG ? p.gewichtG / 1000 : '', p.cent / 100,
      p.herkunft ? HERKUNFT[p.herkunft] : '', p.ustSatz ?? '',
      p.ustSatz != null ? anteil.nettoCent / 100 : '', p.ustSatz != null ? anteil.ustCent / 100 : '',
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
