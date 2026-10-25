/* ============================================================
 * PREISE ÄNDERN (verwaltung/preise.html) – ENTWURF
 * ============================================================
 * Phase P0 aus docs/PREISVERWALTUNG.md: Formular für alle Werte aus
 * js/preise-config.js mit Prüfungen, Änderungsliste und Vorschau.
 * Gespeichert wird noch nichts – „Speichern“ zeigt nur, was als neue
 * Preisliste in die Datenbank ginge.
 * ============================================================ */
'use strict';

(function () {
  const ORIGINAL = (window.KRUCKENHAUS_PREISE || {}).config;
  if (!ORIGINAL) return;

  const $ = (id) => document.getElementById(id);
  const kopie = (o) => JSON.parse(JSON.stringify(o));
  let werte = kopie(ORIGINAL);

  // ----------------------------------------------------------
  // 1. FELDER: Pfad im PREISE-Objekt, Beschriftung, Grenzen
  // ----------------------------------------------------------
  function felder() {
    const f = [];
    ORIGINAL.saisons.forEach((s, i) => {
      f.push({ gruppe: 'Saisons', pfad: ['saisons', i, 'preis'], label: s.label + ' – € pro Nacht', hilfe: s.zeitraum, min: 50, max: 600, schritt: 1 });
      f.push({ gruppe: 'Saisons', pfad: ['saisons', i, 'mindest'], label: s.label + ' – Mindestnächte', min: 1, max: 28, schritt: 1 });
    });
    f.push(
      { gruppe: 'Zusatzkosten', pfad: ['zusatz', 'endreinigung'], label: 'Endreinigung (€)', min: 0, max: 300, schritt: 1 },
      { gruppe: 'Zusatzkosten', pfad: ['zusatz', 'haustier'], label: 'Haustier (€ pro Aufenthalt)', min: 0, max: 200, schritt: 1 },
      { gruppe: 'Zusatzkosten', pfad: ['zusatz', 'spaeterCheckout'], label: 'Späterer Check-out (€)', min: 0, max: 200, schritt: 1 },
      { gruppe: 'Aufenthaltsabgabe', pfad: ['ortstaxe', 'betrag'], label: '€ pro Person und Nacht', min: 0, max: 10, schritt: 0.1, hilfe: 'gesetzlich – nur ändern, wenn der Tourismusverband sie ändert' },
      { gruppe: 'Aufenthaltsabgabe', pfad: ['ortstaxe', 'abAlter'], label: 'gilt ab Alter', min: 0, max: 18, schritt: 1 },
    );
    ORIGINAL.rabatte.langzeit.forEach((r, i) => {
      f.push({ gruppe: 'Langzeitrabatt (nur Nebensaison)', pfad: ['rabatte', 'langzeit', i, 'abNaechte'], label: 'Stufe ' + (i + 1) + ' – ab Nächten', min: 2, max: 60, schritt: 1 });
      f.push({ gruppe: 'Langzeitrabatt (nur Nebensaison)', pfad: ['rabatte', 'langzeit', i, 'prozent'], label: 'Stufe ' + (i + 1) + ' – Rabatt %', min: 0, max: 40, schritt: 1 });
    });
    f.push(
      { gruppe: 'Zahlung', pfad: ['zahlung', 'anzahlungProzent'], label: 'Anzahlung %', min: 0, max: 100, schritt: 1 },
      { gruppe: 'Zahlung', pfad: ['zahlung', 'restzahlungTage'], label: 'Restzahlung Tage vor Anreise', min: 0, max: 60, schritt: 1 },
      { gruppe: 'Storno', pfad: ['storno', 'kostenlosBis'], label: 'Anzahlung zurück ab Tagen vorher', min: 1, max: 120, schritt: 1 },
      { gruppe: 'Storno', pfad: ['storno', 'teilrueckerstattungBis'], label: 'halbe Anzahlung zurück ab Tagen vorher', min: 0, max: 120, schritt: 1 },
      { gruppe: 'Storno', pfad: ['storno', 'bearbeitungsgebuehr'], label: 'Bearbeitungsgebühr (€)', min: 0, max: 100, schritt: 1 },
    );
    return f;
  }
  const FELDER = felder();

  const lies = (obj, pfad) => pfad.reduce((o, k) => (o == null ? o : o[k]), obj);
  function setze(obj, pfad, wert) {
    const ziel = pfad.slice(0, -1).reduce((o, k) => o[k], obj);
    ziel[pfad[pfad.length - 1]] = wert;
  }
  const zahlText = (z) => (z == null || Number.isNaN(z)) ? '–' : z.toLocaleString('de-AT', { maximumFractionDigits: 2 });
  const eur = (z) => z.toLocaleString('de-AT', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';

  // ----------------------------------------------------------
  // 2. FORMULAR AUFBAUEN
  // ----------------------------------------------------------
  function formularBauen() {
    const ziel = $('pv-felder');
    ziel.textContent = '';
    let gruppe = null, raster = null;
    FELDER.forEach((f, i) => {
      if (f.gruppe !== gruppe) {
        gruppe = f.gruppe;
        const h = document.createElement('h2');
        h.className = 'ag-abstand';
        h.textContent = gruppe;
        raster = document.createElement('div');
        raster.className = 'ag-zwei';
        ziel.append(h, raster);
      }
      const box = document.createElement('div');
      box.className = 'ag-feld';
      const id = 'pv-f' + i;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = f.label;
      const input = document.createElement('input');
      Object.assign(input, { id, type: 'number', min: f.min, max: f.max, step: f.schritt, inputMode: 'decimal' });
      input.dataset.index = i;
      input.value = lies(werte, f.pfad);
      box.append(label, input);
      if (f.hilfe) {
        const h = document.createElement('span');
        h.className = 'ag-klein pv-hilfe';
        h.textContent = f.hilfe;
        box.append(h);
      }
      raster.append(box);
    });
    zeitraeumeBauen(ziel);
  }

  // ----------------------------------------------------------
  // 2b. SAISON-ZEITRÄUME (Tag/Monat, gelten jedes Jahr)
  // ----------------------------------------------------------
  /** 'MM-DD' → '1.3.' */
  function mdText(md) {
    if (!md) return '';
    const [m, t] = md.split('-').map(Number);
    return t + '.' + m + '.';
  }
  /** '1.3.' / '01.03' → 'MM-DD' oder null */
  function mdLesen(text) {
    const m = /^\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*$/.exec(text || '');
    if (!m) return null;
    const tag = Number(m[1]), monat = Number(m[2]);
    const tageImMonat = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monat - 1];
    if (!tageImMonat || tag < 1 || tag > tageImMonat) return null;
    return String(monat).padStart(2, '0') + '-' + String(tag).padStart(2, '0');
  }
  const zrText = (liste) => liste.map(([v, b]) => mdText(v) + '–' + mdText(b)).join(', ');

  function zeitraeumeBauen(ziel) {
    const block = document.createElement('div');
    const h = document.createElement('h2');
    h.className = 'ag-abstand';
    h.textContent = 'Saison-Zeiträume';
    const hilfe = document.createElement('p');
    hilfe.className = 'ag-klein';
    hilfe.textContent = 'Tag und Monat, z. B. 1.3. bis 31.5. – gilt jedes Jahr. Das ganze Jahr muss genau einmal abgedeckt sein. Ostern wird automatisch erkannt und zum Sommerpreis gerechnet.';
    block.append(h, hilfe);

    werte.saisons.forEach((s, i) => {
      const box = document.createElement('div');
      box.className = 'pv-saison-zr';
      const t = document.createElement('h3');
      t.textContent = s.label;
      box.append(t);
      s.zeitraeume.forEach((zr, j) => {
        const zeile = document.createElement('div');
        zeile.className = 'pv-zr-zeile';
        ['von', 'bis'].forEach((art, k) => {
          const inp = document.createElement('input');
          Object.assign(inp, { type: 'text', inputMode: 'decimal', placeholder: art === 'von' ? 'von' : 'bis' });
          inp.setAttribute('aria-label', s.label + ' Zeitraum ' + (j + 1) + ' ' + art);
          inp.value = mdText(zr[k]) || (zr[k] === null ? '' : '');
          inp.dataset.zr = i + ',' + j + ',' + k;
          if (zr[k] === null) inp.classList.add('pv-falsch');
          zeile.append(inp);
          if (k === 0) { const strich = document.createElement('span'); strich.textContent = 'bis'; zeile.append(strich); }
        });
        if (s.zeitraeume.length > 1) {
          const weg = document.createElement('button');
          Object.assign(weg, { type: 'button', className: 'pv-zr-knopf', textContent: '×', title: 'Zeitraum entfernen' });
          weg.dataset.zrWeg = i + ',' + j;
          zeile.append(weg);
        }
        box.append(zeile);
      });
      const neu = document.createElement('button');
      Object.assign(neu, { type: 'button', className: 'pv-zr-knopf pv-zr-neu', textContent: '+ Zeitraum' });
      neu.dataset.zrNeu = i;
      box.append(neu);

      const feld = document.createElement('div');
      feld.className = 'ag-feld';
      const lab = document.createElement('label');
      lab.htmlFor = 'pv-zrtext' + i;
      lab.textContent = 'Text auf der Preisseite';
      const txt = document.createElement('input');
      Object.assign(txt, { id: 'pv-zrtext' + i, type: 'text', value: s.zeitraum });
      txt.dataset.zrtext = i;
      feld.append(lab, txt);
      box.append(feld);
      block.append(box);
    });

    const vor = [...ziel.querySelectorAll('h2')].find((x) => x.textContent === 'Zusatzkosten');
    ziel.insertBefore(block, vor || null);
  }

  /** Prüft, ob jeder Tag des Jahres genau einer Saison gehört (Schaltjahr als Vorlage) */
  function abdeckungPruefen(fehler) {
    let ungueltig = false;
    werte.saisons.forEach((s) => s.zeitraeume.forEach(([v, b]) => {
      if (!v || !b) { ungueltig = true; return; }
      if (v > b) fehler.push(s.label + ': „' + mdText(v) + ' bis ' + mdText(b) + '“ – das Ende liegt vor dem Anfang. Über den Jahreswechsel bitte in zwei Zeiträume teilen.');
    }));
    if (ungueltig) { fehler.push('Saison-Zeiträume: Bitte jedes Datum als Tag.Monat. eintragen, z. B. 1.3.'); return; }
    const luecken = [], doppelt = [];
    for (let d = new Date(2028, 0, 1, 12); d.getFullYear() === 2028; d.setDate(d.getDate() + 1)) {
      const md = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const treffer = werte.saisons.filter((s) => s.zeitraeume.some(([v, b]) => md >= v && md <= b));
      if (!treffer.length) luecken.push(md);
      else if (treffer.length > 1) doppelt.push({ md, namen: treffer.map((s) => s.label).join(' und ') });
    }
    const bereiche = (liste) => {
      const out = [];
      liste.forEach((md) => {
        const letzte = out[out.length - 1];
        const vorher = letzte && new Date(2028, Number(letzte.bis.slice(0, 2)) - 1, Number(letzte.bis.slice(3)) + 1, 12);
        const naechster = vorher && String(vorher.getMonth() + 1).padStart(2, '0') + '-' + String(vorher.getDate()).padStart(2, '0');
        if (letzte && naechster === md) letzte.bis = md; else out.push({ von: md, bis: md });
      });
      return out.map((b) => b.von === b.bis ? mdText(b.von) : mdText(b.von) + '–' + mdText(b.bis)).join(', ');
    };
    if (luecken.length) fehler.push('Keiner Saison zugeordnet: ' + bereiche(luecken));
    if (doppelt.length) fehler.push('Doppelt zugeordnet (' + doppelt[0].namen + '): ' + bereiche(doppelt.map((x) => x.md)));
  }

  // ----------------------------------------------------------
  // 3. PRÜFEN
  // ----------------------------------------------------------
  function pruefen() {
    const fehler = [], warnungen = [];
    FELDER.forEach((f, i) => {
      const w = lies(werte, f.pfad), alt = lies(ORIGINAL, f.pfad);
      const el = $('pv-f' + i);
      const falsch = Number.isNaN(w) || w < f.min || w > f.max;
      el.classList.toggle('pv-falsch', falsch);
      el.classList.toggle('pv-geaendert', !falsch && w !== alt);
      if (falsch) fehler.push(f.gruppe + ' · ' + f.label + ': erlaubt ' + zahlText(f.min) + ' bis ' + zahlText(f.max) + '.');
      else if (alt > 0 && Math.abs(w - alt) / alt > 0.3 && f.min > 0) {
        warnungen.push(f.label + ': ' + zahlText(alt) + ' → ' + zahlText(w) + ' ist eine Änderung um mehr als 30 %. Tippfehler?');
      }
    });
    const s = werte.saisons;
    const neben = s.find((x) => x.langzeitRabatt);
    if (neben && s.some((x) => x !== neben && x.preis < neben.preis)) {
      warnungen.push('Die Nebensaison ist nicht mehr die günstigste Saison. Auf der Website steht sie aber als „Unser Tipp“ und als „ab“-Preis.');
    }
    const lz = werte.rabatte.langzeit;
    for (let i = 1; i < lz.length; i++) {
      if (!(lz[i].abNaechte > lz[i - 1].abNaechte)) fehler.push('Langzeitrabatt: Stufe ' + (i + 1) + ' muss mehr Nächte haben als Stufe ' + i + '.');
      if (!(lz[i].prozent >= lz[i - 1].prozent)) warnungen.push('Langzeitrabatt: Stufe ' + (i + 1) + ' gibt weniger Rabatt als Stufe ' + i + '.');
    }
    if (!(werte.storno.teilrueckerstattungBis < werte.storno.kostenlosBis)) {
      fehler.push('Storno: „halbe Anzahlung zurück“ muss weniger Tage haben als „Anzahlung zurück“.');
    }
    abdeckungPruefen(fehler);
    werte.saisons.forEach((s, i) => {
      const alt = ORIGINAL.saisons[i];
      if (zrText(s.zeitraeume) !== zrText(alt.zeitraeume) && s.zeitraum === alt.zeitraum) {
        warnungen.push(s.label + ': Zeiträume geändert, der Text auf der Preisseite („' + s.zeitraum + '“) aber nicht.');
      }
    });
    const gueltig = $('pv-gueltig').value;
    const heute = new Date().toISOString().slice(0, 10);
    if (!gueltig) fehler.push('Bitte „Gültig ab“ eintragen.');
    else if (gueltig < heute) warnungen.push('„Gültig ab“ liegt in der Vergangenheit – die Preise gelten dann sofort.');
    return { fehler, warnungen };
  }

  // ----------------------------------------------------------
  // 4. ANZEIGE: Hinweise, Änderungen, Vorschau
  // ----------------------------------------------------------
  function hinweis(box, art, text) {
    const p = document.createElement('p');
    p.className = 'ag-hinweis ag-hinweis--' + art;
    p.textContent = text;
    box.append(p);
  }

  function aenderungen() {
    const liste = FELDER
      .map((f) => ({ f, alt: lies(ORIGINAL, f.pfad), neu: lies(werte, f.pfad) }))
      .filter((a) => a.alt !== a.neu && !Number.isNaN(a.neu));
    werte.saisons.forEach((s, i) => {
      const alt = ORIGINAL.saisons[i];
      if (zrText(s.zeitraeume) !== zrText(alt.zeitraeume)) {
        liste.push({ f: { gruppe: 'Saisons', label: s.label + ' – Zeiträume' }, alt: zrText(alt.zeitraeume), neu: zrText(s.zeitraeume), text: true });
      }
      if (s.zeitraum !== alt.zeitraum) {
        liste.push({ f: { gruppe: 'Saisons', label: s.label + ' – Text' }, alt: alt.zeitraum, neu: s.zeitraum, text: true });
      }
    });
    return liste;
  }

  /** Beispielrechnung wie auf der Preisseite: Nächte (abzgl. Langzeitrabatt) + Endreinigung + Abgabe */
  function beispiel(saison, naechte, personen) {
    let rabatt = 0;
    if (saison.langzeitRabatt) werte.rabatte.langzeit.forEach((r) => { if (naechte >= r.abNaechte) rabatt = r.prozent; });
    const naechtePreis = Math.round(saison.preis * naechte * (1 - rabatt / 100));
    return naechtePreis + werte.zusatz.endreinigung + werte.ortstaxe.betrag * personen * naechte;
  }

  function anzeigen() {
    const { fehler, warnungen } = pruefen();
    const box = $('pv-hinweise');
    box.textContent = '';
    fehler.forEach((t) => hinweis(box, 'warnung', t));
    warnungen.forEach((t) => hinweis(box, 'info', t));
    if (!fehler.length && !warnungen.length) hinweis(box, 'ok', 'Alles plausibel.');

    const liste = $('pv-aenderungen');
    liste.textContent = '';
    const ae = aenderungen();
    if (!ae.length) {
      const li = document.createElement('li'); li.className = 'ag-klein'; li.textContent = 'Noch nichts geändert.'; liste.append(li);
    }
    ae.forEach(({ f, alt, neu }) => {
      const li = document.createElement('li');
      const was = document.createElement('span'); was.textContent = (f.gruppe === 'Saisons' ? '' : f.gruppe + ' · ') + f.label;
      const wert = document.createElement('strong');
      wert.textContent = (typeof alt === 'string' ? alt : zahlText(alt)) + ' → ' + (typeof neu === 'string' ? neu : zahlText(neu));
      li.append(was, wert); liste.append(li);
    });

    const tbody = $('pv-vorschau').querySelector('tbody');
    tbody.textContent = '';
    const zeile = (a, b, alt) => {
      const tr = document.createElement('tr');
      const x = document.createElement('td'); x.textContent = a;
      const y = document.createElement('td'); y.textContent = b;
      if (alt && alt !== b) { const s = document.createElement('span'); s.className = 'pv-alt'; s.textContent = alt; y.prepend(s, ' '); }
      tr.append(x, y); tbody.append(tr);
    };
    const ok = !fehler.length;
    if (ok) {
      const merk = werte; werte = ORIGINAL;
      const altAb = Math.min(...ORIGINAL.saisons.map((s) => s.preis));
      const altNeben = ORIGINAL.saisons.find((s) => s.langzeitRabatt);
      const altBsp1 = altNeben ? beispiel(altNeben, 7, 2) : null;
      const altSommer = ORIGINAL.saisons.find((s) => s.key === 'sommer');
      const altBsp2 = altSommer ? beispiel(altSommer, 7, 4) : null;
      werte = merk;
      const ab = Math.min(...werte.saisons.map((s) => s.preis));
      zeile('„ab“-Preis auf der Website', 'ab ' + eur(ab) + ' / Nacht', 'ab ' + eur(altAb) + ' / Nacht');
      zeile('Zusatz zum „ab“-Preis', 'zzgl. ' + eur(werte.zusatz.endreinigung) + ' Endreinigung', 'zzgl. ' + eur(ORIGINAL.zusatz.endreinigung) + ' Endreinigung');
      const neben = werte.saisons.find((s) => s.langzeitRabatt);
      if (neben) zeile('Beispiel: 2 Personen, 7 Nächte, ' + neben.label, eur(beispiel(neben, 7, 2)), altBsp1 != null ? eur(altBsp1) : null);
      const sommer = werte.saisons.find((s) => s.key === 'sommer');
      if (sommer) zeile('Beispiel: 4 Personen, 7 Nächte, Sommer', eur(beispiel(sommer, 7, 4)), altBsp2 != null ? eur(altBsp2) : null);
    } else {
      zeile('Vorschau', 'erst nach Korrektur der Fehler');
    }

    $('pv-speichern').disabled = !(ok && ae.length && $('pv-airbnb').checked);
    $('pv-status').textContent = '';
  }

  // ----------------------------------------------------------
  // 5. START
  // ----------------------------------------------------------
  function initPreise() {
    const form = $('pv-form');
    if (!form) return;
    $('pv-gueltig').value = new Date().toISOString().slice(0, 10);
    formularBauen();

    form.addEventListener('input', (e) => {
      const d = e.target.dataset;
      if (d.index != null) setze(werte, FELDER[d.index].pfad, e.target.value === '' ? NaN : Number(e.target.value));
      if (d.zr) {
        const [i, j, k] = d.zr.split(',').map(Number);
        const md = mdLesen(e.target.value);
        werte.saisons[i].zeitraeume[j][k] = md;
        e.target.classList.toggle('pv-falsch', !md);
      }
      if (d.zrtext != null) werte.saisons[Number(d.zrtext)].zeitraum = e.target.value;
      anzeigen();
    });
    form.addEventListener('click', (e) => {
      const knopf = e.target.closest('button');
      if (!knopf) return;
      if (knopf.dataset.zrWeg) {
        const [i, j] = knopf.dataset.zrWeg.split(',').map(Number);
        werte.saisons[i].zeitraeume.splice(j, 1);
      } else if (knopf.dataset.zrNeu != null) {
        werte.saisons[Number(knopf.dataset.zrNeu)].zeitraeume.push([null, null]);
      } else return;
      formularBauen();
      anzeigen();
    });
    form.addEventListener('submit', (e) => e.preventDefault());
    $('pv-airbnb').addEventListener('change', anzeigen);

    $('pv-zuruecksetzen').addEventListener('click', () => {
      werte = kopie(ORIGINAL);
      formularBauen();
      $('pv-airbnb').checked = false;
      anzeigen();
    });

    $('pv-speichern').addEventListener('click', () => {
      // Entwurf: zeigt nur, was gespeichert würde (Tabelle preislisten, Spalte daten)
      const n = aenderungen().length;
      const [j, m, t] = $('pv-gueltig').value.split('-');
      $('pv-status').textContent = 'Entwurf: Die ' + (n === 1 ? 'Änderung würde' : n + ' Änderungen würden') +
        ' als neue Preisliste „gültig ab ' + Number(t) + '.' + Number(m) + '.' + j + '“ gespeichert. Noch ist nichts gespeichert.';
      console.info('Neue Preisliste (Entwurf):', { gueltig_ab: $('pv-gueltig').value, notiz: $('pv-notiz').value, daten: werte });
    });

    const verlauf = $('pv-verlauf');
    const li = document.createElement('li');
    li.innerHTML = '<strong>Aktuell gültig</strong> <span class="ag-klein">Preise aus js/preise-config.js · Stand Ende September 2026</span>';
    verlauf.append(li);

    anzeigen();
  }

  document.addEventListener('DOMContentLoaded', initPreise);
})();
