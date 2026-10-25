/* ============================================================
 * ANGEBOT FÜR DIE FERIENWOHNUNG (verwaltung/angebot.html)
 * ============================================================
 * Rechnet aus Anreise, Abreise und Personen den Preis nach
 * js/preise-config.js (Objekt PREISE) und baut daraus einen
 * Antworttext für E-Mail oder WhatsApp.
 *
 * - Saison wird pro Nacht bestimmt (Aufenthalte über eine
 *   Saisongrenze werden anteilig gerechnet).
 * - Ostern: Nächte in den Osterferien (Samstag vor Palmsonntag bis
 *   Ostersonntag, Abreise spätestens Ostermontag) zählen zum
 *   Sommerpreis (so steht es auf der Preisseite).
 * - Langzeitrabatt nur auf Nächte in Saisons mit langzeitRabatt.
 * - Belegung wird über /api/availability (Airbnb-Kalender) geprüft.
 * - Nichts wird gespeichert (kein localStorage, siehe CLAUDE.md).
 * ============================================================ */
'use strict';

(function () {
  const P = (window.KRUCKENHAUS_PREISE || {}).config;
  if (!P) return;

  const $ = (id) => document.getElementById(id);
  let belegt = null; // [{start, end}] aus dem Airbnb-Kalender, end exklusiv

  // ----------------------------------------------------------
  // 1. HILFSFUNKTIONEN: Datum und Geld
  // ----------------------------------------------------------
  /** "YYYY-MM-DD" → Date (12 Uhr, damit Sommerzeit nichts verschiebt) */
  function datum(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    const [j, m, t] = iso.split('-').map(Number);
    return new Date(j, m - 1, t, 12);
  }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function plusTage(d, n) {
    const x = new Date(d); x.setDate(x.getDate() + n); return x;
  }
  const fmtLang = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtKurz = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtTagMonat = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'long' });
  const eur = (z) => z.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const runde = (z) => Math.round(z * 100) / 100;

  /** Ostersonntag nach der Gaußschen Osterformel (gregorianisch) */
  function ostersonntag(jahr) {
    const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(jahr, monat - 1, tag, 12);
  }
  /** Nacht liegt in den Osterferien: Samstag vor Palmsonntag bis Ostersonntag */
  function istOstern(d) {
    const os = ostersonntag(d.getFullYear());
    return d >= plusTage(os, -8) && d <= os;
  }

  /** Saison für eine Nacht (Datum des Abends) */
  function saisonFuer(d) {
    if (istOstern(d)) {
      const sommer = P.saisons.find((s) => s.key === 'sommer');
      if (sommer) return Object.assign({}, sommer, { label: 'Ostern (Sommerpreis)' });
    }
    const md = iso(d).slice(5);
    return P.saisons.find((s) => s.zeitraeume.some(([von, bis]) => md >= von && md <= bis)) || null;
  }

  // ----------------------------------------------------------
  // 2. BERECHNUNG
  // ----------------------------------------------------------
  function berechne(e) {
    const an = datum(e.anreise), ab = datum(e.abreise);
    const fehler = [], hinweise = [];
    if (!an || !ab) return { fehler: ['Bitte Anreise und Abreise eintragen.'] };
    const naechte = Math.round((ab - an) / 86400000);
    if (naechte < 1) return { fehler: ['Die Abreise muss nach der Anreise liegen.'] };

    // Nächte nach Saison gruppieren (in zeitlicher Reihenfolge)
    const gruppen = [];
    for (let i = 0; i < naechte; i++) {
      const s = saisonFuer(plusTage(an, i));
      if (!s) { fehler.push('Für ' + fmtKurz.format(plusTage(an, i)) + ' ist keine Saison hinterlegt.'); continue; }
      const letzte = gruppen[gruppen.length - 1];
      if (letzte && letzte.saison.label === s.label) letzte.naechte++;
      else gruppen.push({ saison: s, naechte: 1 });
    }
    if (fehler.length) return { fehler };

    // Langzeitrabatt: Stufe nach Gesamtnächten, nur auf berechtigte Nächte
    let rabattProzent = 0;
    P.rabatte.langzeit.forEach((r) => { if (naechte >= r.abNaechte) rabattProzent = r.prozent; });
    let uebernachtung = 0, rabattBasis = 0;
    gruppen.forEach((g) => {
      g.summe = g.saison.preis * g.naechte;
      uebernachtung += g.summe;
      if (g.saison.langzeitRabatt && !g.saison.label.startsWith('Ostern')) rabattBasis += g.summe;
    });
    const rabatt = rabattProzent ? Math.round(rabattBasis * rabattProzent / 100) : 0;

    const ortstaxe = runde(P.ortstaxe.betrag * e.erwachsene * naechte);
    const extras = [];
    extras.push({ text: 'Endreinigung', betrag: P.zusatz.endreinigung });
    if (e.haustier) extras.push({ text: 'Haustier', betrag: P.zusatz.haustier });
    if (e.checkout) extras.push({ text: 'Späterer Check-out bis 14 Uhr', betrag: P.zusatz.spaeterCheckout });
    const nachlass = Math.max(0, e.nachlass || 0);

    const gesamt = runde(uebernachtung - rabatt + extras.reduce((s, x) => s + x.betrag, 0) + ortstaxe - nachlass);
    const anzahlung = Math.round(gesamt * P.zahlung.anzahlungProzent / 100);
    const rest = runde(gesamt - anzahlung);
    const restBis = plusTage(an, -P.zahlung.restzahlungTage);

    // Hinweise für Florian und Kathrin (nicht im Text an den Gast)
    const mindest = gruppen[0].saison.mindest;
    if (naechte < mindest) hinweise.push({ art: 'warnung', text: 'Mindestaufenthalt in der Saison „' + gruppen[0].saison.label + '“: ' + mindest + ' Nächte – angefragt sind ' + naechte + '.' });
    const personen = e.erwachsene + e.kinder;
    if (personen > P.belegung.max) hinweise.push({ art: 'warnung', text: personen + ' Personen – die Wohnung ist für höchstens ' + P.belegung.max + ' Personen.' });
    if (gruppen.length > 1) hinweise.push({ art: 'info', text: 'Der Aufenthalt geht über eine Saisongrenze, die Nächte sind anteilig gerechnet.' });
    if (gruppen.some((g) => g.saison.label.startsWith('Ostern'))) hinweise.push({ art: 'info', text: 'Ostern: Nächte in den Osterferien (Samstag vor Palmsonntag bis Ostersonntag) zum Sommerpreis.' });
    if (restBis <= plusTage(new Date(), 7)) hinweise.push({ art: 'info', text: 'Anreise ist bald: Restzahlung ' + P.zahlung.restzahlungTage + ' Tage vorher ist praktisch nicht mehr möglich – im Text steht deshalb „Rest bar bei der Ankunft“.' });

    return { an, ab, naechte, gruppen, rabattProzent, rabatt, ortstaxe, extras, nachlass, gesamt, anzahlung, rest, restBis, hinweise, kurzfristig: restBis <= plusTage(new Date(), 7) };
  }

  // ----------------------------------------------------------
  // 3. TEXT AN DEN GAST
  // ----------------------------------------------------------
  /** Wählt die passende Form: t(sie, ihr, du) */
  function former(ansprache) {
    const i = { sie: 0, ihr: 1, du: 2 }[ansprache] || 0;
    return (...formen) => formen[i];
  }

  function zeitraumKurz(an, ab) {
    const gleichesJahr = an.getFullYear() === ab.getFullYear();
    return (gleichesJahr ? fmtTagMonat.format(an) : fmtKurz.format(an)) + ' bis ' + fmtKurz.format(ab);
  }

  function baueText(e, r) {
    const t = former(e.ansprache);
    const z = [];
    const name = e.anrede.trim();
    z.push(t('Guten Tag', 'Hallo', 'Hallo') + (name ? ' ' + name : '') + ',');
    z.push('');
    z.push(t('vielen Dank für Ihre Anfrage!', 'vielen Dank für eure Anfrage!', 'vielen Dank für deine Anfrage!') +
      ' Unsere Ferienwohnung ist von ' + fmtLang.format(r.an) + ' bis ' + fmtLang.format(r.ab) + ' frei.');
    const pers = e.erwachsene + ' ' + (e.erwachsene === 1 ? 'Person' : 'Personen') +
      (e.kinder ? ' und ' + e.kinder + ' ' + (e.kinder === 1 ? 'Kind' : 'Kinder') : '');
    z.push('Für ' + pers + ' und ' + r.naechte + ' ' + (r.naechte === 1 ? 'Nacht' : 'Nächte') + ' kostet der Aufenthalt:');
    z.push('');
    r.gruppen.forEach((g) => {
      z.push('• ' + g.naechte + ' × ' + eur(g.saison.preis) + ' (' + g.saison.label + '): ' + eur(g.summe));
    });
    if (r.rabatt) z.push('• Langzeitrabatt ' + r.rabattProzent + ' %: −' + eur(r.rabatt));
    r.extras.forEach((x) => z.push('• ' + x.text + ': ' + eur(x.betrag)));
    z.push('• Aufenthaltsabgabe (' + e.erwachsene + ' × ' + r.naechte + ' × ' + eur(P.ortstaxe.betrag) +
      (e.kinder ? ', Kinder unter ' + P.ortstaxe.abAlter + ' frei' : '') + '): ' + eur(r.ortstaxe));
    if (r.nachlass) z.push('• Nachlass: −' + eur(r.nachlass));
    z.push('Gesamt: ' + eur(r.gesamt) + ' (inkl. 10 % USt.)');
    z.push('');
    z.push('Inklusive sind Bettwäsche, Handtücher, WLAN über Starlink und die Alpbachtal Card. Zur Ankunft gibt es einen Begrüßungskorb aus unserem Hofladen.');
    z.push('Check-in ist von 17 bis 20 Uhr, Check-out bis ' + (e.checkout ? '14' : '10') + ' Uhr.');
    z.push('');
    const restWeg = r.kurzfristig
      ? 'bar bei der Ankunft'
      : 'bis ' + fmtKurz.format(r.restBis) + ' per Überweisung oder bar bei der Ankunft';
    z.push('Zahlung: ' + P.zahlung.anzahlungProzent + ' % Anzahlung (' + eur(r.anzahlung) + ') innerhalb von 7 Tagen nach der Buchungsbestätigung, der Rest (' + eur(r.rest) + ') ' + restWeg + '.');
    z.push('Storno: Bis ' + P.storno.kostenlosBis + ' Tage vor der Anreise ' + t('erstatten wir Ihnen', 'erstatten wir euch', 'erstatten wir dir') +
      ' die Anzahlung abzüglich ' + eur(P.storno.bearbeitungsgebuehr) + ' Bearbeitungsgebühr, ' + P.storno.teilrueckerstattungBis + '–' + (P.storno.kostenlosBis - 1) +
      ' Tage vorher die Hälfte der Anzahlung, danach verfällt sie.');
    z.push('');
    if (e.persoenlich.trim()) { z.push(e.persoenlich.trim()); z.push(''); }
    const gueltig = datum(e.gueltig);
    z.push((gueltig ? 'Das Angebot gilt bis ' + fmtKurz.format(gueltig) + '. ' : '') +
      t('Wenn Sie buchen möchten, genügt eine kurze Antwort. Sie bekommen dann die Buchungsbestätigung mit der Bankverbindung.',
        'Wenn ihr buchen wollt, genügt eine kurze Antwort. Ihr bekommt dann die Buchungsbestätigung mit der Bankverbindung.',
        'Wenn du buchen willst, genügt eine kurze Antwort. Du bekommst dann die Buchungsbestätigung mit der Bankverbindung.'));
    z.push('');
    z.push(t('Herzliche Grüße', 'Liebe Grüße', 'Liebe Grüße'));
    z.push('Kathrin & Florian Häusler');
    z.push('Kruckenhaus · Oberberg 70 · 6252 Breitenbach am Inn');
    z.push('+43 664 2166181 · www.kruckenhaus.at');
    return z.join('\n');
  }

  // ----------------------------------------------------------
  // 4. ANZEIGE
  // ----------------------------------------------------------
  function eingaben() {
    const zahl = (id, min) => Math.max(min, parseInt($(id).value, 10) || 0);
    return {
      anrede: $('ag-anrede').value,
      ansprache: (document.querySelector('input[name="ag-form-ansprache"]:checked') || {}).value || 'sie',
      anreise: $('ag-anreise').value,
      abreise: $('ag-abreise').value,
      erwachsene: zahl('ag-erwachsene', 1),
      kinder: zahl('ag-kinder', 0),
      haustier: $('ag-haustier').checked,
      checkout: $('ag-checkout').checked,
      nachlass: parseFloat($('ag-nachlass').value) || 0,
      gueltig: $('ag-gueltig').value,
      persoenlich: $('ag-persoenlich').value,
      email: $('ag-email').value.trim(),
      telefon: $('ag-telefon').value.trim(),
    };
  }

  function zeile(tbody, links, rechts, klasse) {
    const tr = document.createElement('tr');
    if (klasse) tr.className = klasse;
    const a = document.createElement('td'); a.textContent = links;
    const b = document.createElement('td'); b.textContent = rechts;
    tr.append(a, b); tbody.append(tr);
  }

  function hinweis(box, art, text) {
    const p = document.createElement('p');
    p.className = 'ag-hinweis ag-hinweis--' + art;
    p.textContent = text;
    box.append(p);
  }

  /** Telefonnummer für wa.me: nur Ziffern, österreichische 0… → 43… */
  function waNummer(tel) {
    let n = tel.replace(/[^\d+]/g, '');
    if (n.startsWith('+')) n = n.slice(1);
    else if (n.startsWith('00')) n = n.slice(2);
    else if (n.startsWith('0')) n = '43' + n.slice(1);
    return n;
  }

  function belegungPruefen(r, box) {
    if (!belegt) return;
    const von = iso(r.an), bis = iso(r.ab);
    const konflikt = belegt.filter((b) => b.start < bis && b.end > von);
    if (konflikt.length) {
      hinweis(box, 'warnung', 'Laut Airbnb-Kalender ist der Zeitraum nicht frei (belegt: ' +
        konflikt.map((b) => fmtTagMonat.format(datum(b.start)) + ' – ' + fmtTagMonat.format(datum(b.end))).join(', ') + ').');
    } else {
      hinweis(box, 'ok', 'Laut Airbnb-Kalender ist der Zeitraum frei.');
    }
  }

  function aktualisieren() {
    const e = eingaben();
    const box = $('ag-hinweise');
    const tbody = $('ag-tabelle').querySelector('tbody');
    box.textContent = ''; tbody.textContent = '';
    const r = berechne(e);
    if (r.fehler) {
      r.fehler.forEach((f) => hinweis(box, 'info', f));
      $('ag-text').value = ''; $('ag-betreff').value = '';
      return;
    }
    belegungPruefen(r, box);
    r.hinweise.forEach((h) => hinweis(box, h.art, h.text));

    r.gruppen.forEach((g) => zeile(tbody, g.naechte + ' × ' + eur(g.saison.preis) + ' · ' + g.saison.label, eur(g.summe)));
    if (r.rabatt) zeile(tbody, 'Langzeitrabatt ' + r.rabattProzent + ' %', '−' + eur(r.rabatt));
    r.extras.forEach((x) => zeile(tbody, x.text, eur(x.betrag)));
    zeile(tbody, 'Aufenthaltsabgabe ' + e.erwachsene + ' × ' + r.naechte + ' × ' + eur(P.ortstaxe.betrag), eur(r.ortstaxe));
    if (r.nachlass) zeile(tbody, 'Nachlass', '−' + eur(r.nachlass));
    zeile(tbody, 'Gesamt', eur(r.gesamt), 'ag-summe');
    zeile(tbody, 'Anzahlung ' + P.zahlung.anzahlungProzent + ' %', eur(r.anzahlung), 'ag-nebenzeile');
    zeile(tbody, 'Rest ' + (r.kurzfristig ? 'bei Ankunft' : 'bis ' + fmtKurz.format(r.restBis)), eur(r.rest), 'ag-nebenzeile');
    zeile(tbody, 'entspricht pro Nacht', eur(runde(r.gesamt / r.naechte)), 'ag-nebenzeile');

    const betreff = 'Angebot Ferienwohnung Kruckenhaus, ' + zeitraumKurz(r.an, r.ab);
    const text = baueText(e, r);
    $('ag-betreff').value = betreff;
    $('ag-text').value = text;
    linksSetzen();
  }

  function linksSetzen() {
    const e = eingaben();
    const betreff = $('ag-betreff').value, text = $('ag-text').value;
    $('ag-mail').href = 'mailto:' + encodeURIComponent(e.email) + '?subject=' + encodeURIComponent(betreff) + '&body=' + encodeURIComponent(text);
    $('ag-whatsapp').href = 'https://wa.me/' + (e.telefon ? waNummer(e.telefon) : '') + '?text=' + encodeURIComponent(text);
  }

  // ----------------------------------------------------------
  // 5. START
  // ----------------------------------------------------------
  function initAngebot() {
    const form = $('ag-form');
    if (!form) return;
    $('ag-gueltig').value = iso(plusTage(new Date(), 7));
    form.addEventListener('input', aktualisieren);
    form.addEventListener('change', aktualisieren);
    form.addEventListener('submit', (ev) => ev.preventDefault());
    $('ag-text').addEventListener('input', linksSetzen);
    $('ag-betreff').addEventListener('input', linksSetzen);
    $('ag-anreise').addEventListener('change', () => {
      // Abreise vorschlagen, wenn noch leer oder vor der Anreise
      const an = datum($('ag-anreise').value), ab = datum($('ag-abreise').value);
      if (an && (!ab || ab <= an)) {
        const s = saisonFuer(an);
        $('ag-abreise').value = iso(plusTage(an, s ? s.mindest : 2));
        aktualisieren();
      }
    });

    $('ag-kopieren').addEventListener('click', async () => {
      const text = $('ag-text').value;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        $('ag-status').textContent = 'Text kopiert.';
      } catch (err) {
        $('ag-text').select();
        $('ag-status').textContent = 'Bitte mit Strg+C bzw. „Kopieren“ übernehmen.';
      }
    });

    // Belegung aus dem Airbnb-Kalender (öffentliche Schnittstelle der Website)
    fetch('/api/availability', { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((daten) => {
        if (daten && daten.configured !== false && Array.isArray(daten.busy)) { belegt = daten.busy; aktualisieren(); }
      })
      .catch(() => { /* ohne Kalender weiterrechnen */ });

    aktualisieren();
  }

  document.addEventListener('DOMContentLoaded', initAngebot);
})();
