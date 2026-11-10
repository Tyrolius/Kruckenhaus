/* ============================================================
 * HOFLADEN-VERWALTUNG – VERBINDUNG ZU BERTHA
 * ============================================================
 * Abschnitt 5.10: Schlüssel, Zustand der Schnittstelle, Kunden übernehmen.
 * Teil von verwaltung/ – Reihenfolge und Überblick: siehe Kopf von verwaltung.js.
 * ============================================================ */

'use strict';

// 5.10 Verbindung zu Bertha (Plan: docs/SCHNITTSTELLE-BERTHA.md, Abschnitt 6.1)
// Bertha holt den Katalog etwa alle 15 Minuten. Ampel: grün, wenn der
// letzte erfolgreiche Abruf höchstens eine Stunde her ist.
const BERTHA_RECHTE = {
  katalog: 'Dauerartikel lesen (Nudeln, Seife …)',
  angebot: 'Fleischrunden lesen',
  bestellen: 'Fleisch bestellen',
};
const BERTHA_FEHLER = {
  nicht_angemeldet: 'Schlüssel falsch oder gesperrt',
  keine_berechtigung: 'Recht fehlt',
  pausiert: 'Schnittstelle war pausiert',
  nicht_gefunden: 'unbekannter Aufruf',
  methode: 'unbekannter Aufruf',
  ungueltig: 'fehlerhafte Anfrage',
  zu_viele: 'zu viele Anfragen',
  intern: 'Fehler auf der Website',
};
let neuerSchluessel = null; // nur bis zum Verlassen der Ansicht sichtbar

// D1-Zeit (UTC, „2026-10-13 08:15:00") → Minuten bis jetzt
function minutenHer(sqlZeit) {
  return Math.max(0, Math.round((Date.now() - new Date(`${String(sqlZeit).replace(' ', 'T')}Z`)) / 60000));
}
function herText(sqlZeit) {
  const min = minutenHer(sqlZeit);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Minute${min === 1 ? '' : 'n'}`;
  const std = Math.round(min / 60);
  if (min < 48 * 60) return `vor ${std} Stunde${std === 1 ? '' : 'n'}`;
  return `am ${zeitpunktKurz(sqlZeit)}`;
}

// Kunden übernehmen – z. B. einmalig die Kundenliste aus Bertha (dort:
// Einstellungen → Hofladen → „Kundenliste exportieren"). Jede CSV mit den
// Spalten Name, Telefon, E-Mail, Straße, PLZ, Ort (Notiz optional) geht.
// Erst Vorschau, dann übernehmen; bekannte Kunden werden nur ergänzt.
const IMPORT_SPALTEN = {
  name: ['name'], telefon: ['telefon', 'tel', 'phone'], email: ['e-mail', 'email', 'mail'],
  strasse: ['straße', 'strasse', 'adresse'], plz: ['plz'], ort: ['ort'], notiz: ['notiz', 'anmerkung'],
};

function csvLesen(text) {
  const inhalt = text.replace(/^\ufeff/, '');
  const trenner = (inhalt.split(/\r?\n/)[0].match(/;/g) || []).length >= (inhalt.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
  const zeilen = [];
  let zeile = [];
  let feld = '';
  let inAnf = false;
  for (let i = 0; i < inhalt.length; i++) {
    const c = inhalt[i];
    if (inAnf) {
      if (c === '"' && inhalt[i + 1] === '"') { feld += '"'; i++; } else if (c === '"') inAnf = false; else feld += c;
    } else if (c === '"') inAnf = true;
    else if (c === trenner) { zeile.push(feld); feld = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && inhalt[i + 1] === '\n') i++;
      zeile.push(feld); feld = '';
      if (zeile.some((x) => x.trim())) zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  zeile.push(feld);
  if (zeile.some((x) => x.trim())) zeilen.push(zeile);
  // Excel-Schutz aus dem Export ('+43 …) wieder entfernen
  return zeilen.map((z) => z.map((x) => x.trim().replace(/^'(?=[=+\-@])/, '')));
}

function kundenAusCsv(text) {
  const [kopf, ...rest] = csvLesen(text);
  if (!kopf) return { fehler: 'Die Datei ist leer.' };
  const spalte = {};
  kopf.forEach((titel, i) => {
    const t = titel.toLowerCase();
    Object.entries(IMPORT_SPALTEN).forEach(([feld, namen]) => { if (spalte[feld] == null && namen.includes(t)) spalte[feld] = i; });
  });
  if (spalte.name == null) return { fehler: 'Keine Spalte „Name" gefunden – bitte die CSV aus Bertha verwenden.' };
  const kunden = rest.map((z) => Object.fromEntries(Object.entries(spalte).map(([feld, i]) => [feld, z[i] || ''])))
    .filter((k) => k.name);
  const bekannt = (k) => daten.kunden.some((x) => (k.email && x.email && x.email.toLowerCase() === k.email.toLowerCase())
    || x.name.trim().toLowerCase() === k.name.trim().toLowerCase());
  return { kunden, bekannt: kunden.filter(bekannt).length };
}

function kundenImportKarte() {
  const imp = zustand.kundenImport;
  if (!imp) {
    return `<section class="vw-karte" aria-label="Kunden übernehmen"><h2>Kunden übernehmen</h2>
      <p class="vw-klein">Einmalig die Kundenliste aus Bertha holen: in der Bertha-App unter Einstellungen → Hofladen
        „Kundenliste exportieren", die Datei hier auswählen. Ihr seht zuerst eine Vorschau. Schon bekannte Kunden
        (gleiche E-Mail oder gleicher Name) werden nur ergänzt, nie überschrieben.</p>
      <label class="vw-knopf"><input type="file" accept=".csv,text/csv" data-kunden-import hidden /> CSV-Datei wählen …</label>
    </section>`;
  }
  if (imp.fehler) {
    return `<section class="vw-karte"><h2>Kunden übernehmen</h2><p class="vw-warnung">${esc(imp.fehler)}</p>
      <button type="button" class="vw-knopf" data-aktion="kunden-import-verwerfen">Andere Datei wählen</button></section>`;
  }
  const n = imp.kunden.length;
  return `<section class="vw-karte" aria-label="Kunden übernehmen"><h2>Kunden übernehmen – Vorschau</h2>
    <p><strong>${n} Kunden</strong> in der Datei: ${n - imp.bekannt} neu, ${imp.bekannt} schon bekannt (werden nur ergänzt).</p>
    <table class="vw-tabelle"><tbody>${imp.kunden.slice(0, 8).map((k) => `<tr><td>${esc(k.name)}<br>
      <span class="vw-klein">${esc([k.telefon, k.email, [k.strasse, `${k.plz || ''} ${k.ort || ''}`.trim()].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</span></td></tr>`).join('')}
      ${n > 8 ? `<tr><td class="vw-klein">… und ${n - 8} weitere</td></tr>` : ''}</tbody></table>
    <label class="vw-haken"><input type="checkbox" id="vw-import-stamm" /> Alle als Stammkunden markieren</label>
    <p class="vw-klein">Stammkunden bekommen den Vorlauf bei Bestellrunden (Stammkunden-Link).</p>
    <div class="vw-knopfreihe">
      <button type="button" class="vw-knopf vw-knopf--voll" data-aktion="kunden-import">${n} Kunden übernehmen</button>
      <button type="button" class="vw-knopf" data-aktion="kunden-import-verwerfen">Abbrechen</button>
    </div></section>`;
}

function kundenImportDatei(input) {
  const datei = input.files && input.files[0];
  if (!datei) return;
  const leser = new FileReader();
  leser.onload = () => { zustand.kundenImport = kundenAusCsv(String(leser.result || '')); zeigen(); };
  leser.onerror = () => meldung('Die Datei konnte nicht gelesen werden.');
  leser.readAsText(datei, 'utf-8');
}

async function kundenImportieren() {
  const imp = zustand.kundenImport;
  if (!imp || !imp.kunden) return;
  const stamm = Boolean((document.getElementById('vw-import-stamm') || {}).checked);
  const erg = await speichern('kunden-import', { kunden: imp.kunden, stammkunde: stamm }, () => {
    let neu = 0;
    imp.kunden.forEach((k) => {
      if (daten.kunden.some((x) => x.name.toLowerCase() === k.name.toLowerCase())) return;
      neu++;
      daten.kunden.push({ id: `k${Date.now()}${neu}`, name: k.name, telefon: k.telefon || '', email: k.email || '',
        strasse: k.strasse || '', plz: k.plz || '', ort: k.ort || '', stammkunde: stamm, notiz: k.notiz || '' });
    });
    return { neu, ergaenzt: imp.kunden.length - neu, uebersprungen: 0 };
  }, { neuZeichnen: false });
  if (!erg) return;
  zustand.kundenImport = null;
  zeigen();
  meldung(`Kunden übernommen – neu: ${erg.neu}, ergänzt: ${erg.ergaenzt}${erg.uebersprungen ? `, übersprungen: ${erg.uebersprungen}` : ''}.`);
}

function ansichtBertha() {
  const s = daten.schnittstelle;
  if (!s) {
    inhalt().innerHTML = `<div class="vw-kopf"><h1>Verbindung zu Bertha</h1></div>
      <section class="vw-karte"><p>Die Schnittstelle ist noch nicht eingerichtet: Die Tabellen fehlen in der Datenbank.
        Bitte den Block „Schnittstelle" aus docs/SCHNITTSTELLE-BERTHA.md einmal in der D1-Konsole ausführen.</p></section>`;
    return;
  }
  const aktiv = s.zugaenge.filter((z) => !z.gesperrt);
  let ampel;
  if (s.pausiert) ampel = ['vw-ampel--rot', 'Schnittstelle pausiert – Bertha bekommt gerade keine Daten.'];
  else if (!aktiv.length) ampel = ['vw-ampel--grau', 'Noch nicht verbunden – zuerst einen Schlüssel anlegen.'];
  else if (!s.letzterErfolg) ampel = ['vw-ampel--grau', 'Schlüssel angelegt, Bertha hat aber noch nie abgerufen.'];
  else if (minutenHer(s.letzterErfolg.zeitpunkt) <= 60) {
    ampel = ['vw-ampel--gruen', `${esc(s.letzterErfolg.zugang || 'Bertha')} hat zuletzt ${herText(s.letzterErfolg.zeitpunkt)} abgerufen – alles in Ordnung.`];
  } else ampel = ['vw-ampel--gelb', `Letzter Abruf ${herText(s.letzterErfolg.zeitpunkt)} – Bertha meldet sich gerade nicht.`];

  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Verbindung zu Bertha</h1>
      <p class="vw-klein">Über diese Verbindung zeigt das Bertha-Kundenportal euren Eierkunden die Dauerartikel und – wenn
        freigeschaltet – die Fleischrunden mit „Auch im Bertha-Portal". Gepflegt wird alles hier; Fleischbestellungen aus dem
        Portal landen ganz normal in der Bestellliste, mit dem Zeichen „über Bertha".</p></div>
    <section class="vw-karte vw-ampel ${ampel[0]}" aria-label="Zustand"><p><strong>${ampel[1]}</strong></p>
      <p class="vw-klein">Letzte 24 Stunden: ${s.letzte24h.aufrufe} Abrufe${s.letzte24h.fehler ? `, davon ${s.letzte24h.fehler} mit Fehler` : ''}.</p>
      ${s.fehler.length ? `<h2>Letzte Fehler (7 Tage)</h2><ul class="vw-bertha-fehler">${s.fehler.map((f) =>
        `<li>${esc(zeitpunktKurz(f.zeitpunkt))} · ${esc(BERTHA_FEHLER[f.code] || `Fehler ${f.status}`)}${f.zugang ? ` · ${esc(f.zugang)}` : ''}
          <span class="vw-klein">(${esc(f.aufruf)})</span></li>`).join('')}</ul>` : ''}
    </section>
    ${neuerSchluessel ? `<section class="vw-karte vw-schluessel" aria-label="Neuer Schlüssel">
      <h2>Neuer Schlüssel für „${esc(neuerSchluessel.name)}"</h2>
      <p><strong>Jetzt kopieren und in Bertha unter „Hofladen verbinden" einfügen.</strong>
        Er wird nur dieses eine Mal angezeigt und nirgends gespeichert.</p>
      <code class="vw-schluessel-text" id="vw-schluessel-text">${esc(neuerSchluessel.schluessel)}</code>
      <div class="vw-knopfreihe">
        <button type="button" class="vw-knopf vw-knopf--voll" data-aktion="schluessel-kopieren">Kopieren</button>
        <button type="button" class="vw-knopf" data-aktion="schluessel-fertig">Fertig – ist eingetragen</button>
      </div>
      <p class="vw-klein">Nie per E-Mail oder WhatsApp verschicken. Den alten Schlüssel erst sperren, wenn „Verbindung testen" in Bertha mit dem neuen klappt.</p>
    </section>` : ''}
    <section class="vw-karte" aria-label="Schlüssel"><h2>Schlüssel</h2>
      ${s.zugaenge.length ? s.zugaenge.map((z) => `<div class="vw-produkt-zeile${z.gesperrt ? ' vw-zeile--grau' : ''}">
        <div><strong>${esc(z.name)}</strong>${z.gesperrt ? ' <span class="vw-marke">gesperrt</span>' : ''}<br>
          <span class="vw-klein">${z.rechte.map((r) => esc(BERTHA_RECHTE[r] || r)).join(' · ')}<br>
          angelegt ${esc(zeitpunktKurz(z.erstellt))} · ${z.zuletztGenutzt ? `zuletzt genutzt ${esc(herText(z.zuletztGenutzt))}` : 'noch nie genutzt'}</span></div>
        ${z.gesperrt ? '' : `<div class="vw-knopfreihe vw-knopfreihe--klein">
          <button type="button" class="vw-knopf vw-knopf--klein vw-knopf--warnung" data-aktion="zugang-sperren" data-id="${z.id}">Sperren</button></div>`}
      </div>`).join('') : '<p class="vw-klein">Noch kein Schlüssel angelegt.</p>'}
      <form id="vw-zugang-formular" class="vw-zugang-formular" novalidate>
        <h3>Neuen Schlüssel anlegen</h3>
        <label class="vw-feld"><span>Name</span><input name="name" value="Bertha" placeholder="z. B. Bertha oder Bertha Test" /></label>
        <fieldset class="vw-feldgruppe"><legend>Was darf Bertha?</legend>
          ${Object.entries(BERTHA_RECHTE).map(([wert, textRecht]) => `<label class="vw-haken">
            <input type="checkbox" name="rechte" value="${wert}" ${wert === 'katalog' ? 'checked' : ''} /> ${esc(textRecht)}</label>`).join('')}
          <p class="vw-klein">„Fleisch bestellen" erst freischalten, wenn der Hinweis im Bertha-Portal steht und die Bestellbedingungen geprüft sind.</p>
        </fieldset>
        <button type="submit" class="vw-knopf vw-knopf--voll">Schlüssel anlegen</button>
      </form>
    </section>
    ${kundenImportKarte()}
    <section class="vw-karte" aria-label="Not-Aus"><h2>Schnittstelle ${s.pausiert ? 'pausiert' : 'aktiv'}</h2>
      <p class="vw-klein">Pausieren stoppt sofort alle Abrufe von Bertha. Die Website und eure Bestellungen laufen normal weiter.</p>
      <button type="button" class="vw-knopf ${s.pausiert ? 'vw-knopf--voll' : 'vw-knopf--warnung'}" data-aktion="schnittstelle-pausieren"
        data-wert="${s.pausiert ? '0' : '1'}">${s.pausiert ? 'Wieder einschalten' : 'Schnittstelle pausieren'}</button>
    </section>`;
}

async function zugangAnlegenFormular(form) {
  const name = feld(form, 'name').value.trim();
  const rechte = [...form.querySelectorAll('input[name="rechte"]:checked')].map((x) => x.value);
  if (!name) return meldung('Bitte einen Namen eintragen.');
  if (!rechte.length) return meldung('Bitte mindestens ein Recht auswählen.');
  const erg = await speichern('schnittstelle/zugang', { name, rechte }, () => {
    daten.schnittstelle.zugaenge.unshift({ id: `z${Date.now()}`, name, rechte,
      erstellt: new Date().toISOString().slice(0, 19).replace('T', ' '), zuletztGenutzt: null, gesperrt: null });
    return { schluessel: 'kh_test_BEISPIEL-nur-im-Beispielmodus-nicht-gueltig' };
  }, { neuZeichnen: false });
  if (!erg) return;
  neuerSchluessel = { name, schluessel: erg.schluessel };
  zeigen();
}

async function schluesselKopieren() {
  if (!neuerSchluessel) return;
  try {
    await navigator.clipboard.writeText(neuerSchluessel.schluessel);
    meldung('Schlüssel kopiert.');
  } catch {
    // Ohne Zugriff auf die Zwischenablage: Text markieren, dann selbst kopieren
    const el = document.getElementById('vw-schluessel-text');
    if (el) window.getSelection().selectAllChildren(el);
    meldung('Bitte den markierten Schlüssel selbst kopieren.');
  }
}

function zugangSperren(id) {
  const z = daten.schnittstelle.zugaenge.find((x) => x.id === id);
  if (!z || !window.confirm(`Schlüssel „${z.name}" sperren? Bertha kann damit sofort nicht mehr abrufen.`)) return;
  speichern(`schnittstelle/zugang/${id}/sperren`, {}, () => { z.gesperrt = new Date().toISOString(); return {}; },
    { erfolg: `„${z.name}" ist gesperrt.` });
}

function schnittstellePausieren(pausiert) {
  speichern('schnittstelle/pausieren', { pausiert }, () => { daten.schnittstelle.pausiert = pausiert; return {}; },
    { erfolg: pausiert ? 'Schnittstelle pausiert.' : 'Schnittstelle wieder eingeschaltet.' });
}
