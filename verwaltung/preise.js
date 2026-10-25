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
    return FELDER
      .map((f) => ({ f, alt: lies(ORIGINAL, f.pfad), neu: lies(werte, f.pfad) }))
      .filter((a) => a.alt !== a.neu && !Number.isNaN(a.neu));
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
      const wert = document.createElement('strong'); wert.textContent = zahlText(alt) + ' → ' + zahlText(neu);
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
      const i = e.target.dataset.index;
      if (i != null) setze(werte, FELDER[i].pfad, e.target.value === '' ? NaN : Number(e.target.value));
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
