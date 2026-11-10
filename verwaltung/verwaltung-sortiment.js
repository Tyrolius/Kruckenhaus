/* ============================================================
 * HOFLADEN-VERWALTUNG – SORTIMENT
 * ============================================================
 * Abschnitte 5.9–5.9b: Produkte, Fotos, Einstufung, Bereiche.
 * Teil von verwaltung/ – Reihenfolge und Überblick: siehe Kopf von verwaltung.js.
 * ============================================================ */

'use strict';

// 5.9 Sortiment – Produkte anlegen, ändern, aus- und einblenden
// Ausgeblendete Produkte stehen beim Anlegen einer Bestellrunde nicht zur
// Wahl, alte Bestellungen bleiben unberührt. Gelöscht wird nie.
const kgText = (g) => (g ? kgFormat.format(g / 1000) : '');

// Fehlt Herkunft oder USt-Satz? (nur angebotene Produkte zählen)
const ohneEinstufung = (p) => p.aktiv !== false && !(p.herkunft && p.ustSatz != null);

function ansichtSortiment() {
  const offen = daten.produkte.filter(ohneEinstufung);
  if (!offen.length) zustand.nurOhneEinstufung = false;
  const gezeigt = zustand.nurOhneEinstufung ? offen : daten.produkte;
  const gruppen = nachBereichen(gezeigt, (p) => p.bereichId);
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Sortiment</h1>
      <p class="vw-klein">Alle Produkte, die ihr anbieten könnt. Preis und Menge legt ihr je Bestellrunde fest – hier steht nur ein Preisvorschlag.
        Dauerartikel (z. B. Nudeln, Seife) haben einen festen Preis und sind immer bestellbar, bis ihr sie als ausverkauft markiert.</p>
      <div class="vw-knopfreihe">
        <button type="button" class="vw-knopf vw-knopf--voll" data-aktion="produkt-neu">+ Neues Produkt</button>
        <a class="vw-knopf" href="#bereiche">Bereiche bearbeiten</a>
      </div></div>
    ${offen.length ? `<section class="vw-karte vw-karte--achtung" aria-label="Einstufung fehlt">
      <p><strong>${offen.length} ${offen.length === 1 ? 'Produkt' : 'Produkte'} ohne Einstufung.</strong>
        <span class="vw-klein">Herkunft und USt-Satz braucht die Auswertung für die Buchhaltung.</span></p>
      <div class="vw-knopfreihe">
        <a class="vw-knopf vw-knopf--voll vw-knopf--klein" href="#einstufen">Alle auf einmal einstufen</a>
        <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="sortiment-filter">${zustand.nurOhneEinstufung ? 'Wieder alle zeigen' : 'Nur diese zeigen'}</button>
      </div></section>` : ''}
    ${gruppen.map(([b, liste]) => `<section class="vw-karte"><h2>${esc(b.name)}</h2>
      ${liste.map((p) => `<div class="vw-produkt-zeile${p.aktiv === false ? ' vw-zeile--grau' : ''}">
        <div class="vw-produkt-info">${p.bild
          ? `<img class="vw-produkt-foto" src="${esc(fotoSrc(p.bild))}" alt="" loading="lazy" decoding="async" />`
          : '<span class="vw-produkt-foto vw-produkt-foto--leer">kein Foto</span>'}<div><strong>${esc(p.name)}</strong>${p.aktiv === false ? ' <span class="vw-marke">ausgeblendet</span>' : ''}${p.verkaufsart === 'dauer'
          ? ` <span class="vw-marke ${p.verfuegbar === false ? 'vw-marke--offen' : 'vw-marke--info'}">${p.verfuegbar === false ? 'ausverkauft' : 'Dauerartikel'}</span>` : ''}<br>
          <span class="vw-klein">${p.verkaufsart === 'dauer'
            ? `immer erhältlich · ${p.dauerpreisCent != null ? euro(p.dauerpreisCent) : 'noch ohne Preis'}`
            : `${p.art === 'gewicht' ? 'nach Gewicht' : 'Fixpreis'}${p.startpreisCent != null
              ? ` · Vorschlag ${euro(p.startpreisCent)}${p.art === 'gewicht' ? '/kg' : ''}` : ''}`}${p.allergene ? ` · Allergene: ${esc(p.allergene)}` : ''}<br>
          ${p.herkunft && p.ustSatz != null ? einstufungText(p.herkunft, p.ustSatz) : `<span class="vw-marke vw-marke--rand">${einstufungText(p.herkunft, p.ustSatz)}</span>`}</span></div></div>
        <div class="vw-knopfreihe vw-knopfreihe--klein">
          ${p.verkaufsart === 'dauer' && p.aktiv !== false ? `<button type="button" class="vw-knopf vw-knopf--klein${p.verfuegbar === false ? ' vw-knopf--voll' : ''}" data-aktion="produkt-verfuegbar" data-id="${p.id}">${p.verfuegbar === false ? 'Wieder verfügbar' : 'Ausverkauft'}</button>` : ''}
          <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="produkt-bearbeiten" data-id="${p.id}">Bearbeiten</button>
          <details class="vw-menue">
            <summary class="vw-knopf vw-knopf--klein" aria-label="Weitere Aktionen für ${esc(p.name)}">⋯</summary>
            <div class="vw-menue-liste">
              <button type="button" data-aktion="produkt-kopieren" data-id="${p.id}">Als neues Produkt kopieren</button>
              <button type="button" data-aktion="produkt-aktiv" data-id="${p.id}">${p.aktiv === false ? 'Wieder anbieten' : 'Ausblenden'}</button>
            </div>
          </details>
        </div>
      </div>`).join('')}</section>`).join('')}`;
}

// 5.9b Alle Produkte ohne Einstufung auf einmal einstufen (Herkunft, USt-Satz)
function ansichtEinstufen() {
  const offen = daten.produkte.filter(ohneEinstufung);
  const wahl = (name, leer, eintraege, gewaehlt) => `<select name="${name}" aria-label="${leer}">
    <option value="">${leer}</option>${eintraege.map(([wert, text]) =>
      `<option value="${wert}" ${String(gewaehlt) === String(wert) ? 'selected' : ''}>${text}</option>`).join('')}</select>`;
  const herkuenfte = Object.entries(HERKUNFT);
  const saetze = ustSaetze().map((satz) => [satz, satzText(satz)]);
  inhalt().innerHTML = `
    <div class="vw-kopf"><a class="vw-zurueck" href="#sortiment">‹ Sortiment</a><h1>Produkte einstufen</h1>
      <p class="vw-klein">Herkunft und USt-Satz je Produkt – für Steuer und SVS. Gilt für neue Bestellungen; bestehende behalten ihren Satz.
        Wird auch an Bertha weitergegeben.</p></div>
    ${offen.length ? `<form class="vw-karte" id="vw-einstufen-formular" novalidate>
      ${offen.length > 1 ? `<div class="vw-einstufen-zeile vw-einstufen-zeile--alle"><strong>Für alle übernehmen</strong>
        ${wahl('alle-herkunft', 'Herkunft …', herkuenfte, '')}${wahl('alle-ustSatz', 'USt-Satz …', saetze, '')}</div>` : ''}
      ${offen.map((p) => `<div class="vw-einstufen-zeile" data-produkt="${p.id}"><span>${esc(p.name)}</span>
        ${wahl('herkunft', 'Herkunft …', herkuenfte, p.herkunft || '')}${wahl('ustSatz', 'USt-Satz …', saetze, p.ustSatz ?? '')}</div>`).join('')}
      <button type="submit" class="vw-knopf vw-knopf--voll vw-knopf--breit">Einstufung speichern</button>
    </form>` : '<section class="vw-karte"><p class="vw-erledigt-hinweis">Alle Produkte sind eingestuft ✓</p></section>'}`;
}

// Speichert nur Zeilen, in denen sich etwas geändert hat – eine nach der anderen
async function einstufungSpeichern(form) {
  const aenderungen = [...form.querySelectorAll('[data-produkt]')].map((zeile) => {
    const p = produktVon(zeile.dataset.produkt);
    const herkunft = zeile.querySelector('[name="herkunft"]').value || null;
    const satz = zeile.querySelector('[name="ustSatz"]').value;
    const ustSatz = satz === '' ? null : Number(satz);
    return { p, herkunft, ustSatz };
  }).filter((x) => x.p && (x.herkunft !== (x.p.herkunft || null) || x.ustSatz !== (x.p.ustSatz ?? null)));
  if (!aenderungen.length) return meldung('Bitte zuerst Herkunft bzw. USt-Satz wählen.');
  let gespeichert = 0;
  for (const { p, herkunft, ustSatz } of aenderungen) {
    const erg = await speichern(`produkt/${p.id}`, produktEingabe(produktFormWerte(p), { herkunft, ustSatz }), () => {
      p.herkunft = herkunft;
      p.ustSatz = ustSatz;
      return {};
    }, { neuZeichnen: false });
    if (!erg) break;
    gespeichert += 1;
  }
  if (!gespeichert) return;
  const fertig = gespeichert === aenderungen.length;
  if (fertig && !daten.produkte.some(ohneEinstufung)) location.hash = '#sortiment';
  else zeigen();
  meldung(fertig ? `${gespeichert} ${gespeichert === 1 ? 'Produkt' : 'Produkte'} eingestuft.`
    : `${gespeichert} von ${aenderungen.length} gespeichert – bitte noch einmal versuchen.`);
}

// Produkt aus dem Stand → Werte für das Formular (Preise als Text)
const produktFormWerte = (p) => ({
  ...p, preis: textAusCent(p.startpreisCent), von: kgText(p.richtVonG), bis: kgText(p.richtBisG),
  verkaufsart: p.verkaufsart || 'runde', dauerpreis: textAusCent(p.dauerpreisCent),
  verfuegbar: p.verfuegbar !== false, imPortal: p.imPortal !== false,
  weitereBilder: [...(p.weitereBilder || [])],
});

// vorlageId: „Kopieren" – neues Produkt mit allen Angaben der Vorlage
// (z. B. weitere Nudelsorte), nur Name mit „(Kopie)", wieder angeboten.
function produktFormStarten(id, vorlageId = null) {
  const p = id ? produktVon(id) : null;
  const vorlage = !p && vorlageId ? produktVon(vorlageId) : null;
  zustand.produktForm = p
    ? produktFormWerte(p)
    : vorlage
    ? { ...produktFormWerte(vorlage), id: null, name: `${vorlage.name} (Kopie)`, verwendet: false,
      aktiv: true, verfuegbar: true, kopieVon: vorlage.name }
    : { id: null, name: '', art: 'stueck', bereichId: (daten.bereiche[0] || {}).id || '', preis: '', von: '', bis: '', beschreibung: '',
      pflichtangaben: '', allergene: '', bild: '', weitereBilder: [], aktiv: true, verwendet: false,
      verkaufsart: 'runde', dauerpreis: '', verfuegbar: true, imPortal: true, herkunft: null, ustSatz: null };
  if (fotoliste === null) fotolisteLaden();
}

// Produktfotos: Am einfachsten direkt hier vom Handy hochladen (Kamera oder
// Galerie) – das Foto wird vorher im Browser verkleinert und in der
// Datenbank gespeichert. Zusätzlich wählbar: alle Fotos der Website aus
// images/fotos.json (schreibt die Bild-Automatik auf GitHub).
let fotoliste = null;
const fotoSrc = (pfad) => (pfad.startsWith('data:') ? pfad : `/${pfad}`);

async function fotolisteLaden() {
  fotoliste = [];
  try {
    const antwort = await fetch('/images/fotos.json', { cache: 'no-cache' });
    if (antwort.ok) {
      const liste = await antwort.json();
      fotoliste = Array.isArray(liste) ? liste.filter((f) => typeof f === 'string') : [];
    }
  } catch (_) { /* ohne Liste bleibt nur „Kein Foto" bzw. das bisherige Foto */ }
  // Nur die Foto-Bereiche neu zeichnen – schon Getipptes bleibt stehen
  fotoBereicheZeichnen();
}

function fotoBereicheZeichnen() {
  const f = zustand.produktForm;
  if (!f) return;
  const haupt = document.getElementById('vw-foto-auswahl');
  if (haupt) haupt.innerHTML = fotoAuswahl(f);
  const weitere = document.getElementById('vw-weitere-fotos');
  if (weitere) weitere.innerHTML = weitereFotosAuswahl(f);
}

// „images/hofladen/honig-glas.jpg" → „honig glas"
const fotoName = (pfad) => pfad.split('/').pop().replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ');

function fotoWahl(pfad, gewaehlt) {
  return `<label class="vw-foto-wahl">
    <input type="radio" name="bild" value="${esc(pfad)}" ${gewaehlt === pfad ? 'checked' : ''} />
    ${pfad ? `<img src="${esc(fotoSrc(pfad))}" alt="" loading="lazy" decoding="async" />` : '<span class="vw-foto-leer">Kein Foto</span>'}
    ${pfad.startsWith('images/') ? `<span class="vw-foto-name">${esc(fotoName(pfad))}</span>`
      : pfad ? '' : '<span class="vw-foto-name">ohne Bild</span>'}</label>`;
}

function fotoAuswahl(f) {
  const eigene = daten.eigeneFotos || [];
  const website = fotoliste || [];
  const hofladen = website.filter((x) => x.startsWith('images/hofladen/'));
  // Das gewählte Foto steht immer oben neben „Kein Foto" – auch ein Website-Foto
  // oder eines, das in keiner Liste (mehr) steht –, damit es beim Bearbeiten
  // gleich zu sehen ist und nicht zwischen allen Website-Fotos untergeht
  const aktuell = f.bild && !eigene.includes(f.bild) && !hofladen.includes(f.bild) ? [f.bild] : [];
  const oben = [...aktuell, ...eigene, ...hofladen];
  // Zugeklappt, damit der Speichern-Knopf am Handy nah bleibt
  const weitere = website.filter((x) => !x.startsWith('images/hofladen/') && x !== f.bild);
  return `<fieldset class="vw-feldgruppe"><legend>Foto auf der Hofladen-Seite</legend>
      <label class="vw-knopf vw-knopf--voll vw-foto-knopf">
        <input type="file" accept="image/*" data-foto-hochladen />
        Foto aufnehmen oder wählen</label>
      <p class="vw-klein" id="vw-foto-status" aria-live="polite">${oben.length ? 'Oder ein vorhandenes Foto antippen:' : ''}</p>
      <div class="vw-foto-raster">${fotoWahl('', f.bild)}${oben.map((x) => fotoWahl(x, f.bild)).join('')}</div>
      ${weitere.length ? `<details class="vw-foto-weitere">
        <summary>Foto von der Website nehmen (${weitere.length})</summary>
        <div class="vw-foto-raster">${weitere.map((x) => fotoWahl(x, f.bild)).join('')}</div></details>` : ''}
    </fieldset>`;
}

// Weitere Fotos zur Beschreibung (höchstens WEITERE_FOTOS_MAX): gewählte mit
// „Entfernen", darunter hochladen oder ein vorhandenes Foto antippen. Die
// Kunden sehen alle im gleichen quadratischen Format – Hochformat oder
// Querformat ist egal, nur das Wichtige sollte in der Mitte sein.
const WEITERE_FOTOS_MAX = 4;

function weitereFotosAuswahl(f) {
  const titel = `<legend>Weitere Fotos zur Beschreibung <span class="vw-klein">(höchstens ${WEITERE_FOTOS_MAX})</span></legend>`;
  if (daten.weitereBilderMoeglich === false) {
    return `<fieldset class="vw-feldgruppe">${titel}
      <p class="vw-klein">Noch nicht eingerichtet: dafür einmal schema-hofladen.sql in der D1-Konsole ausführen.</p></fieldset>`;
  }
  const gewaehlt = f.weitereBilder || [];
  const voll = gewaehlt.length >= WEITERE_FOTOS_MAX;
  const angebot = [...new Set([...(daten.eigeneFotos || []), ...(fotoliste || [])])]
    .filter((x) => !gewaehlt.includes(x));
  return `<fieldset class="vw-feldgruppe">${titel}
      <p class="vw-klein">Die Kunden sehen sie beim Aufklappen der Angaben, alle gleich groß und quadratisch zugeschnitten
        – das Wichtige sollte in der Bildmitte sein. Antippen vergrößert sie.</p>
      ${gewaehlt.length ? `<div class="vw-foto-raster">${gewaehlt.map((x, i) => `<div class="vw-foto-gewaehlt">
          <img src="${esc(fotoSrc(x))}" alt="Weiteres Foto ${i + 1}" loading="lazy" decoding="async" />
          <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="weiteres-foto-weg" data-wert="${i}"
            aria-label="Weiteres Foto ${i + 1} entfernen">Entfernen</button></div>`).join('')}</div>`
        : '<p class="vw-klein">Noch keine weiteren Fotos.</p>'}
      ${voll ? `<p class="vw-klein">Vier Fotos sind das Höchste – zum Tauschen erst eines entfernen.</p>` : `
      <label class="vw-knopf vw-knopf--voll vw-foto-knopf">
        <input type="file" accept="image/*" data-weiteres-foto-hochladen />
        Weiteres Foto aufnehmen oder wählen</label>
      <p class="vw-klein" id="vw-weitere-status" aria-live="polite"></p>
      ${angebot.length ? `<details class="vw-foto-weitere">
        <summary>Vorhandenes Foto hinzufügen (${angebot.length})</summary>
        <div class="vw-foto-raster">${angebot.map((x) => `<button type="button" class="vw-foto-wahl" data-aktion="weiteres-foto-dazu"
          data-wert="${esc(x)}"><img src="${esc(fotoSrc(x))}" alt="" loading="lazy" decoding="async" />
          ${x.startsWith('images/') ? `<span class="vw-foto-name">${esc(fotoName(x))}</span>` : ''}</button>`).join('')}</div>
      </details>` : ''}`}
    </fieldset>`;
}

function weiteresFotoDazu(pfad) {
  const f = zustand.produktForm;
  if (!f || !pfad) return;
  f.weitereBilder = f.weitereBilder || [];
  if (f.weitereBilder.includes(pfad)) return;
  if (f.weitereBilder.length >= WEITERE_FOTOS_MAX) { meldung(`Höchstens ${WEITERE_FOTOS_MAX} weitere Fotos.`); return; }
  f.weitereBilder.push(pfad);
  fotoBereicheZeichnen();
  meldung('Foto hinzugefügt – jetzt noch „Speichern" tippen.');
}

function weiteresFotoWeg(index) {
  const f = zustand.produktForm;
  if (!f || !f.weitereBilder) return;
  f.weitereBilder.splice(index, 1);
  fotoBereicheZeichnen();
  meldung('Foto entfernt – jetzt noch „Speichern" tippen.');
}

// Foto im Browser verkleinern (lange Seite max. 1200 px, JPEG). Browser
// drehen Handyfotos dabei richtig (EXIF), das Original bleibt am Handy.
function fotoVerkleinern(datei, max = 1200, qualitaet = 0.82) {
  return new Promise((ok, fehler) => {
    const url = URL.createObjectURL(datei);
    const bild = new Image();
    bild.onload = () => {
      const faktor = Math.min(1, max / Math.max(bild.naturalWidth, bild.naturalHeight));
      const leinwand = document.createElement('canvas');
      leinwand.width = Math.max(1, Math.round(bild.naturalWidth * faktor));
      leinwand.height = Math.max(1, Math.round(bild.naturalHeight * faktor));
      const ctx = leinwand.getContext('2d');
      ctx.fillStyle = '#ffffff'; // durchsichtige PNG-Flächen weiß statt schwarz
      ctx.fillRect(0, 0, leinwand.width, leinwand.height);
      ctx.drawImage(bild, 0, 0, leinwand.width, leinwand.height);
      URL.revokeObjectURL(url);
      ok(leinwand.toDataURL('image/jpeg', qualitaet));
    };
    bild.onerror = () => { URL.revokeObjectURL(url); fehler(new Error('Foto nicht lesbar')); };
    bild.src = url;
  });
}

// weiteres = true: als weiteres Foto zur Beschreibung statt als Hauptfoto
async function produktFotoHochladen(eingabeFeld, weiteres = false) {
  const datei = eingabeFeld.files && eingabeFeld.files[0];
  const f = zustand.produktForm;
  if (!datei || !f) return;
  const status = document.getElementById(weiteres ? 'vw-weitere-status' : 'vw-foto-status');
  if (status) status.textContent = 'Foto wird vorbereitet …';
  let daten64;
  try {
    daten64 = await fotoVerkleinern(datei);
  } catch {
    if (status) status.textContent = '';
    meldung('Dieses Foto lässt sich nicht öffnen – bitte ein anderes wählen.');
    return;
  }
  if (status) status.textContent = 'Foto wird hochgeladen …';
  const erg = await speichern('foto', { daten: daten64 }, () => {
    daten.eigeneFotos = [daten64, ...(daten.eigeneFotos || [])];
    return { bild: daten64 };
  }, { neuZeichnen: false });
  if (!erg) { if (status) status.textContent = ''; return; }
  if (!erg.bild.startsWith('data:') && !(daten.eigeneFotos || []).includes(erg.bild)) {
    daten.eigeneFotos = [erg.bild, ...(daten.eigeneFotos || [])];
  }
  if (weiteres) {
    weiteresFotoDazu(erg.bild);
    return;
  }
  // Neues Foto gleich auswählen; nur die Foto-Bereiche neu zeichnen
  f.bild = erg.bild;
  fotoBereicheZeichnen();
  meldung('Foto hochgeladen und ausgewählt – jetzt noch „Speichern" tippen.');
}

function ansichtProdukt() {
  const f = zustand.produktForm;
  if (!f) { location.hash = '#sortiment'; return; }
  const arten = f.art === 'paket' ? ARTEN : { gewicht: ARTEN.gewicht, stueck: ARTEN.stueck };
  const artGesperrt = f.id && f.verwendet;
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>${f.id ? 'Produkt bearbeiten' : 'Neues Produkt'}</h1>
      ${!f.id && f.kopieVon ? `<p class="vw-klein">Kopie von „${esc(f.kopieVon)}" – alle Angaben sind übernommen. Bitte den Namen anpassen und Foto, Pflichtangaben und Allergene prüfen.</p>` : ''}</div>
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
      <fieldset class="vw-feldgruppe"><legend>Wie wird es angeboten?</legend>
        <div class="vw-auswahl">
          <label><input type="radio" name="verkaufsart" value="runde" ${f.verkaufsart !== 'dauer' ? 'checked' : ''} />
            In Bestellrunden (Preis und Menge je Runde, z. B. Fleisch)</label>
          <label><input type="radio" name="verkaufsart" value="dauer" ${f.verkaufsart === 'dauer' ? 'checked' : ''} />
            Dauerartikel – immer erhältlich (z. B. Nudeln, Seife)</label>
        </div>
      </fieldset>
      <label class="vw-feld" id="vw-startpreis" ${f.verkaufsart === 'dauer' ? 'hidden' : ''}><span>Preisvorschlag in € <span class="vw-klein">(für die erste Bestellrunde; bei Gewicht pro kg)</span></span>
        <input name="preis" inputmode="decimal" value="${esc(f.preis)}" placeholder="z. B. 4,50" /></label>
      <div id="vw-dauer" ${f.verkaufsart === 'dauer' ? '' : 'hidden'}>
        <label class="vw-feld"><span>Preis in € <span class="vw-klein">(fest, gilt ab sofort für neue Bestellungen)</span></span>
          <input name="dauerpreis" inputmode="decimal" value="${esc(f.dauerpreis)}" placeholder="z. B. 4,00" /></label>
        <label class="vw-haken vw-haken--gross"><input type="checkbox" name="verfuegbar" ${f.verfuegbar ? 'checked' : ''} />
          Verfügbar <span class="vw-klein">(Häkchen weg = ausverkauft)</span></label>
        <label class="vw-haken"><input type="checkbox" name="imPortal" ${f.imPortal ? 'checked' : ''} />
          Auch im Bertha-Portal anbieten (für Eierkunden)</label>
      </div>
      <fieldset class="vw-feldgruppe"><legend>Steuer und SVS</legend>
        <label class="vw-feld"><span>Einstufung</span><select name="herkunft">
          <option value="">noch nicht eingestuft</option>
          ${Object.entries(HERKUNFT).map(([wert, text]) => `<option value="${wert}" ${f.herkunft === wert ? 'selected' : ''}>${text}</option>`).join('')}</select></label>
        <label class="vw-feld"><span>USt-Satz</span><select name="ustSatz">
          <option value="">noch nicht festgelegt</option>
          ${ustSaetze().map((satz) => `<option value="${satz}" ${f.ustSatz === satz ? 'selected' : ''}>${satzText(satz)}</option>`).join('')}</select></label>
        <p class="vw-klein">Gilt für neue Bestellungen; bestehende behalten ihren Satz. Wird auch an Bertha weitergegeben.</p>
      </fieldset>
      <label class="vw-feld"><span>Beschreibung (optional)</span><textarea name="beschreibung" rows="2">${esc(f.beschreibung)}</textarea></label>
      <div id="vw-weitere-fotos">${weitereFotosAuswahl(f)}</div>
      <label class="vw-feld"><span>Zutaten, Füllmenge, Herkunft (bei Lebensmitteln Pflicht)</span><textarea name="pflichtangaben" rows="2">${esc(f.pflichtangaben)}</textarea></label>
      <label class="vw-feld"><span>Allergene (z. B. „Ei, Weizen (Gluten)" – leer, wenn keine)</span><input name="allergene" value="${esc(f.allergene)}" /></label>
      <div id="vw-foto-auswahl">${fotoAuswahl(f)}</div>
      <div class="vw-knopfreihe">
        <button type="submit" class="vw-knopf vw-knopf--voll">${f.id ? 'Speichern' : 'Produkt anlegen'}</button>
        <a class="vw-knopf" href="#sortiment">Abbrechen</a>
      </div>
    </form>`;
}

function produktEingabe(f, aenderung = {}) {
  return {
    name: f.name.trim(), art: f.art, bereichId: f.bereichId, startpreisCent: f.preis === '' ? null : centAusText(f.preis),
    verkaufsart: f.verkaufsart || 'runde', dauerpreisCent: f.dauerpreis === '' || f.dauerpreis == null ? null : centAusText(f.dauerpreis),
    verfuegbar: f.verfuegbar !== false, imPortal: f.imPortal !== false,
    richtVonG: f.art === 'gewicht' ? grammAusText(f.von) : null, richtBisG: f.art === 'gewicht' ? grammAusText(f.bis) : null,
    beschreibung: f.beschreibung, pflichtangaben: f.pflichtangaben, allergene: f.allergene, bild: f.bild || '',
    weitereBilder: [...(f.weitereBilder || [])],
    aktiv: f.aktiv !== false, herkunft: f.herkunft || null, ustSatz: f.ustSatz ?? null,
    ...aenderung,
  };
}

async function produktSpeichern(form) {
  const f = zustand.produktForm;
  ['name', 'bereichId', 'preis', 'von', 'bis', 'beschreibung', 'pflichtangaben', 'allergene', 'dauerpreis'].forEach((n) => { f[n] = feld(form, n).value; });
  const art = form.querySelector('input[name="art"]:checked');
  f.art = art ? art.value : f.art;
  const verkaufsart = form.querySelector('input[name="verkaufsart"]:checked');
  f.verkaufsart = verkaufsart ? verkaufsart.value : f.verkaufsart;
  f.verfuegbar = feld(form, 'verfuegbar').checked;
  f.imPortal = feld(form, 'imPortal').checked;
  f.herkunft = feld(form, 'herkunft').value || null;
  f.ustSatz = feld(form, 'ustSatz').value === '' ? null : Number(feld(form, 'ustSatz').value);
  const bild = form.querySelector('input[name="bild"]:checked');
  if (bild) f.bild = bild.value;
  const eingabe = produktEingabe(f);
  if (!eingabe.name) return meldung('Bitte einen Namen eintragen.');
  if (f.preis !== '' && eingabe.startpreisCent == null) return meldung('Bitte den Preis als Zahl eintragen, z. B. 4,50.');
  if (f.verkaufsart === 'dauer') {
    if (f.art === 'gewicht') return meldung('Ware nach Gewicht kann kein Dauerartikel sein – bitte „Fixpreis" wählen.');
    if (eingabe.dauerpreisCent == null) return meldung('Bitte den Preis des Dauerartikels als Zahl eintragen, z. B. 4,00.');
  }
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
    dauersortimentBeispiel();
    return {};
  }, { neuZeichnen: false });
  if (!erg) return;
  zustand.produktForm = null;
  location.hash = '#sortiment';
  zeigen();
  meldung(`„${eingabe.name}" gespeichert.`);
}

function produktAktivUmschalten(p) {
  const f = produktFormWerte(p);
  const aktiv = p.aktiv === false;
  speichern(`produkt/${p.id}`, produktEingabe(f, { aktiv }), () => { p.aktiv = aktiv; return {}; },
    { erfolg: aktiv ? `„${p.name}" wird wieder angeboten.` : `„${p.name}" ist ausgeblendet.` });
}

// Dauerartikel: „verfügbar / ausverkauft" direkt in der Liste umschalten
function produktVerfuegbarUmschalten(p) {
  const verfuegbar = p.verfuegbar === false;
  speichern(`produkt/${p.id}/verfuegbar`, { verfuegbar }, () => { p.verfuegbar = verfuegbar; return {}; },
    { erfolg: verfuegbar ? `„${p.name}" ist wieder verfügbar.` : `„${p.name}" ist als ausverkauft markiert.` });
}

// Beispielmodus: ständige Runde wie dauersortimentAbgleichen() auf dem Server
function dauersortimentBeispiel() {
  const dauer = daten.produkte.filter((p) => p.verkaufsart === 'dauer' && p.dauerpreisCent != null);
  let ch = daten.chargen.find(istDauer);
  if (!ch && !dauer.length) return;
  if (!ch) {
    ch = { id: 'c-dauer', titel: 'Dauersortiment', status: 'offen', bestellschluss: '9999-12-31', art: 'dauer', imPortal: true, termine: [], artikel: [] };
    daten.chargen.push(ch);
  }
  dauer.forEach((p) => {
    const a = ch.artikel.find((x) => x.produktId === p.id);
    if (a) a.preisCent = p.dauerpreisCent;
    else ch.artikel.push({ id: `a-${p.id}`, produktId: p.id, name: p.name, art: p.art, preisCent: p.dauerpreisCent, kontingent: 0 });
  });
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
