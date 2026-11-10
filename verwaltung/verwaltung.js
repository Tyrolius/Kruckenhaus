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
 *   uebersicht · bestellungen · neu · hofverkauf · vormerken · uebergabe · voranmeldungen · mehr ·
 *   sortiment · einstufen · bereiche · produkt (bearbeiten) · wiegen · zahlungen ·
 *   charge (bearbeiten) · charge-neu · bertha (Verbindung zu Bertha)
 * Eine Bestellrunde heißt in der Datenbank „charge" (Tabelle chargen).
 * Die ständige Runde „Dauersortiment" (art 'dauer') hat keine Mengen und
 * keinen Bestellschluss; ihre Artikel kommen aus dem Sortiment
 * (Produkte mit verkaufsart 'dauer', Plan: docs/SCHNITTSTELLE-BERTHA.md).
 *
 * Aufgeteilt in mehrere Dateien, die index.html in dieser Reihenfolge lädt
 * (klassische Skripte ohne Build – alle teilen sich denselben Namensraum):
 *   verwaltung-kern.js          1–4   Zustand, Helfer, Daten, Laden/Speichern, Bausteine
 *   verwaltung-bestellungen.js  5.1–5.3  Übersicht, „Mehr", Bestellungen, Erfassen
 *   verwaltung-uebergabe.js     5.4–5.6  Wiegen, Übergabe, Verkauf am Hof, Zahlungen
 *   verwaltung-runden.js        5.7–5.8a Vormerkungen, Bestellrunde, Auswertung
 *   verwaltung-sortiment.js     5.9–5.9b Sortiment, Fotos, Einstufung, Bereiche
 *   verwaltung-bertha.js        5.10  Verbindung zu Bertha
 *   verwaltung.js (diese Datei, zuletzt)  6–9  Detail-Dialog, Export und Druck,
 *                               Meldung, Navigation und Ereignisse, Start
 * Neue Datei? In index.html vor verwaltung.js eintragen.
 * ============================================================ */

'use strict';

function ansichtLeer() {
  inhalt().innerHTML = `
    <div class="vw-kopf"><h1>Hofladen</h1></div>
    ${widerrufeKarte()}
    <section class="vw-karte">
      <h2>Noch keine laufende Bestellrunde</h2>
      <p>Legt die erste Bestellrunde an – Produkte, Preise und Termine. Vormerkungen könnt ihr jederzeit erfassen.</p>
      <div class="vw-knopfreihe">
        <a class="vw-knopf vw-knopf--voll" href="#charge-neu">+ Neue Bestellrunde</a>
        <a class="vw-knopf" href="#voranmeldungen">Vormerkungen</a>
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
    const einzeln = einzelgewichteText(p);
    const detail = a.art === 'gewicht'
      ? (p.gewichtG ? `${kg(p.gewichtG)} × ${euro(preis)}/kg${einzeln ? `<br>je Stück: ${einzeln}` : ''}` : `${euro(preis)}/kg, noch nicht gewogen`)
      : `je ${euro(preis)}`;
    return `<tr><td>${p.menge}× ${esc(a.name)}<br><span class="vw-klein">${detail}</span></td>
      <td class="vw-zahl">${betragText(betrag)}</td></tr>`;
  }).join('');

  // Oben steht die eine nächste Aktion; Seltenes (Preis, Menge, Zahlungswunsch,
  // Rückgängig, Stornieren, Lieferschein) liegt eingeklappt unter „Mehr".
  const gross = 'vw-knopf vw-knopf--voll vw-knopf--breit vw-knopf--gross';
  const bezahltKnopf = (art, klasse) => `<button type="button" class="${klasse}" data-aktion="bezahlt" data-wert="${art}" data-id="${b.id}">${art === 'bar' ? 'Bar erhalten' : 'Geld am Konto'}</button>`;
  const andereArt = b.zahlart === 'bar' ? 'ueberweisung' : 'bar';
  // Termin wechseln (z. B. Zustellung statt Abholung) – solange nicht übergeben
  const terminWahl = !b.uebergeben && !istHofverkauf(b) && t && ch.termine.length > 1
    ? `<div class="vw-termin-wahl" role="group" aria-label="Termin ändern"><span class="vw-klein">Termin ändern:</span>
        <div class="vw-chips">${ch.termine.map((x) => `<button type="button" class="vw-chip" data-aktion="termin-setzen" data-id="${b.id}" data-wert="${x.id}"
          aria-pressed="${x.id === b.terminId}"${x.id === b.terminId ? ' disabled' : ''}>${terminText(x)}</button>`).join('')}</div></div>`
    : '';
  // Interne Notiz, z. B. „eingefroren, holt nach dem Urlaub" – steht dann auch in der Übergabe
  const notizFeld = istHofverkauf(b) ? '' : `<form class="vw-notiz" id="vw-notiz-formular" data-id="${b.id}" novalidate>
      <label class="vw-feld"><span>Interne Notiz (sieht der Kunde nicht)</span>
        <textarea name="notiz" rows="2" maxlength="1000" placeholder="z. B. eingefroren, holt nach dem Urlaub ab">${esc(b.interneNotiz || '')}</textarea></label>
      <button type="submit" class="vw-knopf vw-knopf--klein">Notiz speichern</button>
    </form>`;
  let haupt = '';
  let mehr = [];
  if (b.status === 'vorgemerkt') {
    if (!b.uebergeben && (t || istDauer(ch) || istHofverkauf(b))) {
      haupt = `<button type="button" class="${gross}" data-aktion="abgabe" data-id="${b.id}">Übergeben …</button>
        <p class="vw-klein vw-mitte">Gewichte eintippen und kassieren – in einem Schritt.</p>
        ${b.bezahlt ? '' : `<div class="vw-knopfreihe vw-knopfreihe--gleich">
          <span class="vw-klein">Vorab bezahlt:</span>${bezahltKnopf('bar', 'vw-knopf vw-knopf--klein')}${bezahltKnopf('ueberweisung', 'vw-knopf vw-knopf--klein')}</div>`}`;
    } else if (b.uebergeben && !b.bezahlt) {
      haupt = `${bezahltKnopf(b.zahlart, gross)}
        <div class="vw-knopfreihe vw-knopfreihe--gleich">${bezahltKnopf(andereArt, 'vw-knopf vw-knopf--klein')}
          <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="zahlungsinfo" data-id="${b.id}">Zahlungsinfo mit QR-Code</button></div>`;
    } else if (b.uebergeben) {
      haupt = '<p class="vw-erledigt-hinweis">Übergeben und bezahlt ✓</p>';
    }
    mehr = [
      terminWahl,
      notizFeld,
      b.positionen.map((p) => preisFeld(b, p)).join(''),
      !b.uebergeben ? mengeAendernBlock(b) : korrigierenKnopf(b),
      `<div class="vw-knopfreihe" role="group" aria-label="Zahlung gewünscht">
        <span class="vw-klein">Zahlung gewünscht:</span>
        ${Object.entries(ZAHLARTEN).map(([wert, text]) => `<button type="button" class="vw-chip" data-aktion="zahlart-setzen" data-id="${b.id}" data-wert="${wert}" aria-pressed="${b.zahlart === wert}">${text}</button>`).join('')}
      </div>`,
      `<ul class="vw-aufgaben">
        <li><button type="button" data-aktion="lieferschein" data-id="${b.id}"><span>Lieferschein drucken<br><span class="vw-klein">z. B. für ein Gasthaus, mit jedem Stück und Gewicht</span></span></button></li>
        <li><button type="button" data-aktion="uebergeben" data-id="${b.id}">${b.uebergeben ? 'Übergabe rückgängig machen' : 'Nur als übergeben markieren (ohne Wiegen und Kassieren)'}</button></li>
        ${b.bezahlt ? `<li><button type="button" data-aktion="bezahlt" data-wert="" data-id="${b.id}">Zahlung (${ZAHLARTEN[b.bezahlt]}) rückgängig machen</button></li>` : ''}
        <li><button type="button" class="vw-warnung" data-aktion="stornieren" data-id="${b.id}">Bestellung stornieren</button></li>
      </ul>`,
    ];
  } else if (b.status === 'warteliste') {
    haupt = `<button type="button" class="${gross}" data-aktion="nachruecken" data-id="${b.id}">Nachrücken lassen</button>
      ${mengeAendernBlock(b)}`;
    mehr = [
      terminWahl,
      notizFeld,
      b.positionen.map((p) => preisFeld(b, p)).join(''),
      `<ul class="vw-aufgaben"><li><button type="button" class="vw-warnung" data-aktion="stornieren" data-id="${b.id}">Von der Warteliste streichen</button></li></ul>`,
    ];
  } else {
    haupt = `<button type="button" class="${gross}" data-aktion="wiederherstellen" data-id="${b.id}">Wiederherstellen</button>`;
  }
  const mehrHtml = mehr.filter(Boolean).join('');
  // „Mehr" bleibt offen, solange man darin arbeitet (nach jedem Speichern wird neu gezeichnet),
  // und klappt von selbst auf, wenn ein Preis vom letzten Mal zum Übernehmen bereitsteht
  const mehrOffen = zustand.detailMehr === b.id || mehrHtml.includes('data-aktion="preis-gemerkt"');
  const kontaktFehlt = t && t.art === 'lieferung' && !k.strasse;

  dialog.innerHTML = `<div class="vw-dialog-inhalt">
    <div class="vw-dialog-kopf">
      <div><h2 id="vw-dialog-titel">${esc(k.name)}</h2>
        <span class="vw-klein">${esc(b.nummer)} · ${quelleText(b)} · ${datumKurz(b.erstellt)}${k.stammkunde ? ' · Stammkunde' : ''}</span></div>
      <button type="button" class="vw-schliessen" data-aktion="schliessen" aria-label="Schließen">×</button>
    </div>
    <div class="vw-abschnitt">${marken(b)}
      ${(daten.widerrufe || []).filter((w) => w.bestellungId === b.id).map((w) =>
        `<p class="vw-warnung">Widerruf am ${zeitpunktKurz(w.eingegangen)} Uhr: ${esc(w.umfang)}</p>`).join('')}
      ${t ? '' : (b.status === 'storniert' || istDauer(ch) || istHofverkauf(b) ? '' : `<p><strong>Termin noch offen</strong> – mit dem Kunden klären und hier wählen:</p>
        <div class="vw-knopfreihe">${ch.termine.map((x) => `<button type="button" class="vw-knopf" data-aktion="termin-setzen" data-id="${b.id}" data-wert="${x.id}">${terminText(x)}</button>`).join('')}</div>`)}
    </div>
    ${haupt ? `<div class="vw-abschnitt vw-detail-haupt">${haupt}</div>` : ''}
    <div class="vw-abschnitt">
      <table class="vw-tabelle"><tbody>${positionen}</tbody>
        <tfoot><tr><td>Summe</td><td class="vw-zahl">${betragText(summe)}</td></tr></tfoot></table>
      ${b.anmerkung ? `<p class="vw-hinweis">„${esc(b.anmerkung)}"</p>` : ''}
      ${b.interneNotiz ? `<p class="vw-hinweis">${istHofverkauf(b) ? '' : 'Notiz: '}${esc(b.interneNotiz)}</p>` : ''}
    </div>
    <div class="vw-abschnitt">
      ${t ? `<p><strong>${terminText(t)}</strong></p>` : ''}
      ${t && t.art === 'lieferung' ? (k.strasse
        ? `<p>${esc(k.strasse)}, ${esc(`${k.plz} ${k.ort}`.trim())}</p>`
        : '<p class="vw-warnung">Lieferadresse fehlt – bitte unter „Name und Kontakt ändern" eintragen.</p>') : ''}
      <p>${k.telefon ? esc(k.telefon) : '<span class="vw-klein">keine Telefonnummer</span>'}${k.email ? `<br><a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : ''}</p>
      <div class="vw-kontakt-zeile vw-kontakt-zeile--links">
        ${k.telefon ? `<a href="tel:${esc(k.telefon.replace(/\s/g, ''))}">Anrufen</a>` : ''}
        ${k.telefon ? `<a href="${whatsappLink(b, bereitText(b))}" target="_blank" rel="noopener">${t ? 'WhatsApp „ist fertig"' : 'WhatsApp „Bestätigung"'}</a>` : ''}
        ${t && t.art === 'lieferung' && k.strasse ? `<a href="${navLink(b)}" target="_blank" rel="noopener">Navi</a>` : ''}
      </div>
      <details class="vw-kontakt" ${kontaktFehlt ? 'open' : ''}>
        <summary>Name und Kontakt ändern</summary>
        <form id="vw-kontakt-formular" data-id="${b.id}" novalidate>
          ${k.name === SAMMELKUNDE ? '' : `<label class="vw-feld"><span>Name</span><input name="name" value="${esc(k.name)}" autocomplete="off" required />
            <span class="vw-klein">Gilt für alle Bestellungen und Vormerkungen dieses Kunden.</span></label>`}
          <label class="vw-feld"><span>Telefon</span><input name="telefon" type="tel" value="${esc(k.telefon)}" /></label>
          <label class="vw-feld"><span>E-Mail</span><input name="email" type="email" value="${esc(k.email || '')}" /></label>
          <label class="vw-feld"><span>Straße und Hausnummer</span><input name="strasse" value="${esc(k.strasse)}" /></label>
          <label class="vw-feld"><span>PLZ</span><input name="plz" inputmode="numeric" value="${esc(k.plz)}" /></label>
          <label class="vw-feld"><span>Ort</span><input name="ort" value="${esc(k.ort)}" /></label>
          <button type="submit" class="vw-knopf vw-knopf--voll">Kontakt speichern</button>
        </form>
      </details>
    </div>
    ${mehrHtml ? `<details class="vw-mehr vw-detail-mehr" data-detail-mehr="${b.id}"${mehrOffen ? ' open' : ''}>
      <summary>Mehr: Termin, Notiz, Preis, Menge, Stornieren …</summary>${mehrHtml}</details>` : ''}
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
  // Name ändern: kein zweiter Kunde gleichen Namens (die Schnittstelle prüft es ebenfalls)
  const namensFeld = feld(form, 'name');
  const name = namensFeld ? namensFeld.value.trim() : k.name;
  if (!name) return meldung('Bitte einen Namen eintragen.');
  if (name !== k.name) {
    if (daten.kunden.some((x) => x.id !== k.id && x.name.toLowerCase() === name.toLowerCase())) {
      return meldung(`Einen Kunden „${name}" gibt es schon – bitte unterscheidbar schreiben, z. B. mit dem Ort.`);
    }
    eingabe.name = name;
  }
  speichern(`bestellung/${b.id}`, eingabe, () => {
    ['telefon', 'email', 'strasse', 'plz', 'ort'].forEach((f) => { if (eingabe[f]) k[f] = eingabe[f]; });
    if (eingabe.name) k.name = eingabe.name;
    return {};
  }, { erfolg: `Kontakt von ${name} gespeichert.` });
}

function notizSpeichern(form) {
  const b = bestellungVon(form.dataset.id);
  if (!b || istHofverkauf(b)) return;
  const text = feld(form, 'notiz').value.trim();
  speichern(`bestellung/${b.id}`, { aktion: 'notiz', text }, () => { b.interneNotiz = text; return {}; },
    { erfolg: text ? 'Notiz gespeichert.' : 'Notiz entfernt.' });
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
    'geschätzt', 'Zahlart', 'Bezahlt', 'Übergeben', 'Anmerkung', 'Einzelgewichte kg'];
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
          `${k.plz} ${k.ort}`.trim(), quelleText(b), b.status,
          t ? (t.art === 'abholung' ? 'Abholung' : 'Lieferung') : (istHofverkauf(b) ? 'Verkauf am Hof' : 'offen'),
          t ? t.datum : '', a.name, p.menge,
          p.gewichtG ? p.gewichtG / 1000 : '', preisVon(ch, p) / 100, a.art === 'gewicht' ? 'kg' : 'Stück',
          betrag.cent / 100, betrag.geschaetzt ? 'ja' : '', ZAHLARTEN[b.zahlart],
          b.bezahlt ? ZAHLARTEN[b.bezahlt] : 'offen', b.uebergeben ? 'ja' : 'nein', b.anmerkung,
          einzelgewichteText(p).replace(/ kg$/, '')]);
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
    <h2>${t ? esc(terminText(t)) : istDauer(ch) ? 'Abholung nach Absprache' : 'Ohne Termin'} – ${esc(ch.titel)}</h2>
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
  // Dauersortiment: alles ohne Termin gehört auf die Abholliste
  if ((!nurAuswahl || istDauer(ch)) && ohne.length) teile.push(terminListeHtml(ch, null, ohne));
  if (!teile.length) return meldung('Keine offenen Bestellungen zum Drucken.');
  druck.innerHTML = teile.join('');
  window.print();
}

// Absender und Logo auf Packzettel und Lieferschein
const ABSENDER = 'Bergbauernhof Kruckenhaus · Florian & Kathrin Häusler · Oberberg 70 · 6252 Breitenbach am Inn';
const LOGO = '../images/logo/kruckenhaus-logo-kopf-dunkel.png';
// UID-Nummer wie im Impressum (impressum.html) – bei Änderung beide anpassen
const UID = 'ATU71717868';

// Drucken erst, wenn alle Bilder (Logo) geladen sind – sonst fehlt das Logo
// beim ersten Druck. Spätestens nach 3 Sekunden wird trotzdem gedruckt.
function druckenWennBereit(druck) {
  const offen = [...druck.querySelectorAll('img')].filter((img) => !img.complete);
  if (!offen.length) { window.print(); return; }
  let gedruckt = false;
  const los = () => { if (!gedruckt) { gedruckt = true; window.print(); } };
  let rest = offen.length;
  offen.forEach((img) => {
    const fertig = () => { rest -= 1; if (!rest) los(); };
    img.addEventListener('load', fertig, { once: true });
    img.addEventListener('error', fertig, { once: true });
  });
  setTimeout(los, 3000);
}

// Ein Packzettel: Kunde, Termin, jede Position mit Gewicht (bei mehreren
// Stücken auch jedes Stück einzeln) und Summe.
// zahlung = false: ohne Zahlart, Bankdaten und QR-Code.
// unterschrift = true: Feld „Ware erhalten" für den Kunden.
// Der Lieferschein hat ein eigenes Blatt: lieferscheinHtml().
function packzettelHtml(b, { titel = '', zahlung = true, unterschrift = false } = {}) {
  const ch = chargeVon(b);
  const k = kundeVon(b);
  const t = terminVon(b);
  const lieferung = t && t.art === 'lieferung';
  return `<section class="vw-packzettel">
    <div class="vw-packzettel-kopf">
      <img class="vw-packzettel-logo" src="${LOGO}" alt="Kruckenhaus 1895" width="323" height="112" />
      <p class="vw-packzettel-absender">${ABSENDER.split(' · ').slice(0, 2).map(esc).join('<br>')}<br>${esc(ABSENDER.split(' · ').slice(2).join(' · '))}<br>UID: ${esc(UID)}</p>
    </div>
    <h2>${titel ? `${esc(titel)} ` : ''}${esc(b.nummer)} – ${esc(k.name)}</h2>
    <p>${t ? terminText(t) : istHofverkauf(b) ? 'Verkauf am Hof' : 'Termin offen'}${lieferung && k.strasse ? ` · ${esc(adresseVon(k))}` : ''}${k.telefon ? ` · ${esc(k.telefon)}` : ''}</p>
    <table class="vw-tabelle"><tbody>${b.positionen.map((p) => {
      const a = artikelVon(ch, p.artikelId);
      const einzeln = einzelgewichteText(p);
      const preis = a.art === 'gewicht' ? `${euro(preisVon(ch, p))}/kg` : `je ${euro(preisVon(ch, p))}`;
      return `<tr><td>${p.menge}× ${esc(a.name)} <span class="vw-druck-klein">(${preis})</span>
          ${einzeln ? `<br><span class="vw-druck-klein">je Stück: ${einzeln}</span>` : ''}</td>
        <td class="vw-zahl">${p.gewichtG ? kg(p.gewichtG) : ''}</td>
        <td class="vw-zahl">${betragText(positionBetrag(ch, p))}</td></tr>`;
    }).join('')}</tbody>
    <tfoot><tr><td colspan="2">Summe${zahlung ? ` · ${b.bezahlt ? `bezahlt (${ZAHLARTEN[b.bezahlt]})` : ZAHLARTEN[b.zahlart]}` : ''}</td>
      <td class="vw-zahl">${betragText(bestellBetrag(b))}</td></tr></tfoot></table>
    ${zahlung && !b.bezahlt && b.zahlart === 'ueberweisung' ? ueberweisungsBlock(b) : ''}
    ${unterschrift ? `<div class="vw-unterschrift">
      <strong>Ware erhalten</strong>
      <div class="vw-unterschrift-felder">
        <div><span class="vw-unterschrift-linie"></span><span class="vw-druck-klein">Datum</span></div>
        <div><span class="vw-unterschrift-linie"></span><span class="vw-druck-klein">Name in Blockschrift</span></div>
        <div><span class="vw-unterschrift-linie"></span><span class="vw-druck-klein">Unterschrift</span></div>
      </div>
    </div>` : ''}
  </section>`;
}

function packzettelDrucken() {
  const ch = aktiveCharge();
  const druck = document.getElementById('vw-druck');
  if (!druck) return;
  druck.innerHTML = bestellungenDerCharge(ch)
    .filter((b) => istAktiv(b) && !istHofverkauf(b))
    .sort((x, y) => kundeVon(x).name.localeCompare(kundeVon(y).name, 'de'))
    .map((b) => packzettelHtml(b)).join('');
  druckenWennBereit(druck);
}

// Lieferschein für eine einzelne Bestellung (z. B. ein Gasthaus mit 15 Gänsen).
// Lieferschein im Aufbau des Bertha-Lieferscheins (DeliveryNotePdfBuilder in
// der App), damit ein Kunde von beiden denselben Beleg kennt: links Titel,
// Nummer, Tag und Stempel, rechts das Logo; darunter Absender, „Lieferung an",
// Positionen mit Spaltenköpfen, unten eine Unterschriftszeile und die Fußzeile.
// Wie in Bertha ohne Preise, Beträge und Summe – die stehen auf der Rechnung,
// ebenso Zahlart, Bankdaten und QR-Code.
// Darunter „Angaben zur Ware": Verbrauchsdatum, Herkunft, Hinweise und ein
// Zusatz (z. B. separat gewogene Innereien). Diese Angaben werden vor dem
// Drucken abgefragt (lieferscheinDialog) und nicht in D1 gespeichert.

// Vorschläge für den Lieferschein-Dialog. Die letzten Eingaben gelten bis zum
// Neuladen der Seite als Vorschlag für den nächsten Lieferschein (z. B. beide
// Gasthäuser derselben Gänse-Runde); der Zusatz gilt nur für die eine Bestellung.
const LS_HERKUNFT = 'Ursprung: Österreich · aus bäuerlicher Schlachtung · Erzeuger: Bergbauernhof Kruckenhaus, '
  + 'Florian & Kathrin Häusler, Oberberg 70, 6252 Breitenbach am Inn';
const LS_HINWEISE = 'Frisch, nicht tiefgekühlt. Gekühlt bei höchstens +4 °C lagern, Kühlkette nicht unterbrechen. '
  + 'Rohes Geflügel getrennt von anderen Lebensmitteln lagern und verarbeiten; Hände, Arbeitsflächen und Geräte '
  + 'nach dem Kontakt gründlich reinigen, Fleischsaft nicht mit anderen Speisen in Berührung bringen. '
  + 'Vor dem Verzehr vollständig durchgaren (Kerntemperatur mindestens 70 °C).';
const lsLetzte = { verbrauchenBis: '', herkunft: null, hinweise: null };
const lsZusatz = new Map();

// Fleisch in der Bestellung? Dann sind Herkunft und Hinweise vorbelegt.
function mitFleisch(b) {
  const ch = chargeVon(b);
  return b.positionen.some((p) => {
    const a = artikelVon(ch, p.artikelId);
    return a.art === 'gewicht' || (produktVon(a.produktId) || {}).kategorie === 'fleisch';
  });
}

function lieferscheinDialog(b) {
  const dialog = document.getElementById('vw-dialog');
  if (!dialog || !b) return;
  const k = kundeVon(b);
  const fleisch = mitFleisch(b);
  const herkunft = lsLetzte.herkunft ?? (fleisch ? LS_HERKUNFT : '');
  const hinweise = lsLetzte.hinweise ?? (fleisch ? LS_HINWEISE : '');
  dialog.innerHTML = `<div class="vw-dialog-inhalt">
    <div class="vw-dialog-kopf">
      <div><h2 id="vw-dialog-titel">Lieferschein drucken</h2><span class="vw-klein">${esc(k.name)} · ${esc(b.nummer)}</span></div>
      <button type="button" class="vw-schliessen" data-aktion="schliessen" aria-label="Schließen">×</button>
    </div>
    <form id="vw-lieferschein-formular" data-id="${b.id}" novalidate>
      <label class="vw-feld"><span>Verbrauchen bis</span><input name="verbrauchenBis" type="date" value="${esc(lsLetzte.verbrauchenBis)}" />
        <span class="vw-klein">Bei frischem Geflügel „Verbrauchen bis" statt Mindesthaltbarkeit. Leer lassen = steht nicht drauf.</span></label>
      <label class="vw-feld"><span>Herkunft</span><textarea name="herkunft" rows="2">${esc(herkunft)}</textarea></label>
      <label class="vw-feld"><span>Hinweise für Lagerung und Küche</span><textarea name="hinweise" rows="5">${esc(hinweise)}</textarea></label>
      <label class="vw-feld"><span>Zusatz (nur auf diesem Lieferschein)</span><textarea name="zusatz" rows="2" placeholder="z. B. Innereien (Herz, Leber, Magen, Hals) separat beigepackt: 1,85 kg">${esc(lsZusatz.get(b.id) || '')}</textarea></label>
      <p class="vw-klein">Zutaten und Allergene aus dem Sortiment werden automatisch mitgedruckt. Diese Angaben werden nicht gespeichert, nur bis zum Neuladen der Seite gemerkt.</p>
      <button type="submit" class="vw-knopf vw-knopf--voll">Drucken</button>
    </form>
  </div>`;
  delete dialog.dataset.id;
  if (!dialog.open) dialog.showModal();
}

function lieferscheinFormular(form) {
  const b = bestellungVon(form.dataset.id);
  if (!b) return;
  const angaben = {};
  ['verbrauchenBis', 'herkunft', 'hinweise', 'zusatz'].forEach((n) => { angaben[n] = feld(form, n).value.trim(); });
  lsLetzte.verbrauchenBis = angaben.verbrauchenBis;
  lsLetzte.herkunft = angaben.herkunft;
  lsLetzte.hinweise = angaben.hinweise;
  lsZusatz.set(b.id, angaben.zusatz);
  document.getElementById('vw-dialog').close();
  lieferscheinDrucken(b, angaben);
}

function lieferscheinHtml(b, angaben = {}) {
  const ch = chargeVon(b);
  const k = kundeVon(b);
  const t = terminVon(b);
  const lieferung = t && t.art === 'lieferung';
  const datumLang = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const tag = t ? `${lieferung ? 'Liefertag' : 'Abholtag'} ${datumLang(t.datum)}` : istHofverkauf(b) ? 'Verkauf am Hof' : '';
  const [betrieb, ...anschrift] = ABSENDER.split(' · ');
  const mitGewicht = b.positionen.some((p) => artikelVon(ch, p.artikelId).art === 'gewicht');
  const zeilen = b.positionen.map((p) => {
    const a = artikelVon(ch, p.artikelId);
    const einzeln = einzelgewichteText(p);
    return `<tr><td>${esc(a.name)}${einzeln ? `<br><span class="vw-druck-klein">je Stück: ${einzeln}</span>` : ''}</td>
      <td class="vw-zahl">${p.menge}</td>
      ${mitGewicht ? `<td class="vw-zahl">${p.gewichtG ? kg(p.gewichtG) : ''}</td>` : ''}</tr>`;
  }).join('');
  // Gesamtgewicht nur, wenn alle Gewichtsartikel gewogen sind
  const gewichtsPos = b.positionen.filter((p) => artikelVon(ch, p.artikelId).art === 'gewicht');
  const gesamtG = gewichtsPos.every((p) => p.gewichtG) ? gewichtsPos.reduce((s, p) => s + p.gewichtG, 0) : 0;
  // Zutaten/Allergene aus dem Sortiment, je Produkt einmal
  const produktAngaben = [...new Set(b.positionen.map((p) => artikelVon(ch, p.artikelId).produktId))]
    .map((id) => produktVon(id)).filter((p) => p && (p.pflichtangaben || p.allergene))
    .map((p) => `<p><strong>${esc(p.name)}:</strong> ${esc(p.pflichtangaben || '')}${p.allergene ? `${p.pflichtangaben ? ' · ' : ''}Allergene: ${esc(p.allergene)}` : ''}</p>`)
    .join('');
  const ware = [
    angaben.verbrauchenBis ? `<p class="vw-ls-verbrauch">Verbrauchen bis: ${datumLang(angaben.verbrauchenBis)}</p>` : '',
    angaben.herkunft ? `<p>${esc(angaben.herkunft)}</p>` : '',
    produktAngaben,
    angaben.hinweise ? `<p>${esc(angaben.hinweise)}</p>` : '',
    angaben.zusatz ? `<p><strong>${esc(angaben.zusatz)}</strong></p>` : '',
  ].join('');
  return `<section class="vw-lieferschein">
    <div class="vw-ls-kopf">
      <div>
        <h2>Lieferschein</h2>
        <p class="vw-ls-meta">Nr. ${esc(b.nummer)}${tag ? `<br>${tag}` : ''}</p>
        <span class="vw-ls-stempel${b.uebergeben ? ' vw-ls-stempel--erledigt' : ''}">${b.uebergeben ? 'Übergeben' : 'Offen'}</span>
      </div>
      <img class="vw-ls-logo" src="${LOGO}" alt="Kruckenhaus 1895" width="323" height="112" />
    </div>
    <div class="vw-ls-block">
      <strong>${esc(betrieb)}</strong>
      <span class="vw-ls-grau">${anschrift.map(esc).join(' · ')}</span>
      <span class="vw-ls-grau">UID: ${esc(UID)}</span>
    </div>
    <div class="vw-ls-block">
      <span class="vw-ls-grau">${lieferung ? 'Lieferung an' : 'Übergabe an'}</span>
      <strong class="vw-ls-empfaenger">${esc(k.name)}</strong>
      ${k.strasse ? `<span>${esc(adresseVon(k))}</span>` : ''}
      ${k.telefon ? `<span class="vw-ls-grau">${esc(k.telefon)}</span>` : ''}
    </div>
    <table class="vw-ls-tabelle">
      <thead><tr><th>Artikel</th><th class="vw-zahl">Menge</th>${mitGewicht ? '<th class="vw-zahl">Gewicht</th>' : ''}</tr></thead>
      <tbody>${zeilen}</tbody>
      ${gesamtG ? `<tfoot><tr><td colspan="2">Gesamtgewicht</td><td class="vw-zahl">${kg(gesamtG)}</td></tr></tfoot>` : ''}
    </table>
    ${ware ? `<div class="vw-ls-ware"><span class="vw-ls-grau">Angaben zur Ware</span>${ware}</div>` : ''}
    <div class="vw-ls-fuss">
      <span class="vw-ls-grau">Ware erhalten</span>
      <span class="vw-ls-linie"></span>
      <span class="vw-druck-klein">Ort, Datum, Unterschrift</span>
      <p class="vw-ls-fusszeile">Gedruckt ${new Date().toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}</p>
    </div>
  </section>`;
}

function lieferscheinDrucken(b, angaben) {
  const druck = document.getElementById('vw-druck');
  if (!druck || !b) return;
  druck.innerHTML = lieferscheinHtml(b, angaben);
  druckenWennBereit(druck);
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
  vormerken: ansichtVormerken,
  mehr: ansichtMehr,
  sortiment: ansichtSortiment,
  einstufen: ansichtEinstufen,
  bereiche: ansichtBereiche,
  auswertung: ansichtAuswertung,
  produkt: ansichtProdukt,
  charge: () => ansichtCharge(false),
  'charge-neu': () => ansichtCharge(true),
  bertha: ansichtBertha,
};
// Diese Ansichten funktionieren auch ohne laufende Bestellrunde
const OHNE_CHARGE = ['voranmeldungen', 'vormerken', 'mehr', 'charge-neu', 'sortiment', 'einstufen', 'bereiche', 'produkt', 'auswertung', 'bertha'];

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
    hofverkauf: 'neu', vormerken: 'neu', abgabe: 'uebergabe', produkt: 'sortiment', einstufen: 'sortiment', bereiche: 'sortiment', wiegen: 'uebersicht',
    zahlungen: 'bestellungen', charge: 'bestellungen', 'charge-neu': 'bestellungen',
  }[name] || name;
  // Am Handy steht in der Leiste „Mehr" für alles, was dort keinen eigenen Platz hat
  const unterMehr = ['mehr', 'voranmeldungen', 'sortiment', 'auswertung', 'bertha'].includes(menuepunkt);
  // Neuer Schlüssel nur so lange sichtbar, bis die Ansicht verlassen wird
  if (name !== 'bertha') neuerSchluessel = null;
  document.querySelectorAll('.vw-nav a[data-ansicht]').forEach((a) => {
    if (a.dataset.ansicht === menuepunkt || (a.dataset.ansicht === 'mehr' && unterMehr)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function neuZeichnen() {
  // Formulare nicht neu zeichnen, sonst gehen Eingaben verloren
  if (!['neu', 'vormerken', 'einstufen', 'charge', 'charge-neu', 'produkt'].includes(aktuelleAnsicht())) zeigen();
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

    // Knöpfe auf einer Rundenkarte der Übersicht gelten für diese Runde
    if (el.dataset.runde && daten.chargen.some((c) => c.id === el.dataset.runde)) {
      if (zustand.chargeId !== el.dataset.runde) {
        zustand.chargeForm = null;
        zustand.hof = { mengen: {}, stueck: {}, name: '' };
      }
      zustand.chargeId = el.dataset.runde;
      zustand.alleRunden = false;
    }

    switch (el.dataset.aktion) {
      case 'runde-oeffnen':
        zustand.filter = el.dataset.filter || 'alle';
        if (location.hash === el.dataset.ziel) zeigen();
        else location.hash = el.dataset.ziel;
        break;
      case 'filter-alle':
        zustand.alleRunden = daten.chargen.length > 1;
        zustand.filter = el.dataset.wert;
        if (aktuelleAnsicht() === 'bestellungen') zeigen();
        else location.hash = '#bestellungen';
        break;
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
        const feldMenge = document.getElementById(`menge-${el.dataset.id}`);
        const alt = Math.max(0, Math.floor(Number(feldMenge.value) || 0));
        const neu = el.dataset.aktion === 'plus' ? Math.min(999, alt + 1) : Math.max(0, alt - 1);
        feldMenge.value = String(neu);
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
      case 'va-bearbeiten':
        e.preventDefault();
        zustand.vaBearbeiten = el.dataset.id;
        ansichtVoranmeldungen();
        document.getElementById('vw-va-bearbeiten')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        break;
      case 'va-bearbeiten-abbrechen':
        zustand.vaBearbeiten = null;
        ansichtVoranmeldungen();
        break;
      case 'va-absagen': {
        e.preventDefault();
        const id = el.dataset.id;
        speichern(`voranmeldung/${id}/absagen`, {}, () => {
          daten.voranmeldungen = daten.voranmeldungen.filter((v) => v.id !== id);
          return {};
        }, { erfolg: 'Vormerkung abgesagt.' });
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
        zustand.chargeForm.termine.push({ id: null, art: el.dataset.wert, datum: '', von: el.dataset.wert === 'abholung' ? '09:00' : '14:00', bis: el.dataset.wert === 'abholung' ? '12:00' : '18:00', hinweis: '' });
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
      case 'lieferschein':
        lieferscheinDialog(b);
        break;
      case 'preis-gemerkt': {
        const p = b && b.positionen.find((x) => x.id === el.dataset.pos);
        if (p) preisSpeichern(b, p, Number(el.dataset.wert));
        break;
      }
      case 'alle-gesehen':
        alsGesehenMarkieren(bestellungenDerCharge().filter((x) => x.neu).map((x) => x.id)).then(() => {
          zustand.filter = 'alle';
          zeigen();
          meldung('Alle als gesehen markiert.');
        });
        break;
      case 'korrigieren':
        // Übergebene Bestellung korrigieren (Gewicht vertippt, Innereien dazu):
        // Übergabe zurücknehmen und gleich die Übergabe-Karte mit allen
        // gespeicherten Einzelgewichten öffnen – nur das falsche Feld ändern,
        // dann wieder „Übergeben". Schon bezahlt: erst die Zahlung zurücksetzen,
        // damit der kassierte Betrag nicht zum alten Stand eingefroren bleibt.
        if (!b) break;
        if (b.bezahlt) {
          meldung('Schon als bezahlt markiert – erst „Zahlung rückgängig machen", dann korrigieren.');
          break;
        }
        bestellungAendern(b, { aktion: 'uebergeben', wert: false }, () => { b.uebergeben = false; },
          'Zum Korrigieren geöffnet – ändern, dann wieder „Übergeben".').then((erg) => {
          if (!erg) return;
          if (daten.chargen.some((c) => c.id === b.chargeId)) {
            zustand.chargeId = b.chargeId;
            zustand.alleRunden = false;
            if (terminArt(b)) zustand.uebergabeArt = terminArt(b);
          }
          zustand.abgabeId = b.id;
          const dialog = document.getElementById('vw-dialog');
          if (dialog && dialog.open) dialog.close();
          if (aktuelleAnsicht() === 'abgabe') zeigen(); else location.hash = '#abgabe';
        });
        break;
      case 'abgabe':
        if (b && daten.chargen.some((c) => c.id === b.chargeId)) {
          zustand.chargeId = b.chargeId;
          zustand.alleRunden = false;
          if (terminArt(b)) zustand.uebergabeArt = terminArt(b);
        }
        zustand.abgabeId = el.dataset.id;
        if (aktuelleAnsicht() === 'abgabe') {
          document.getElementById('vw-dialog').close();
          zeigen();
        } else location.hash = '#abgabe';
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
      case 'produkt-kopieren':
        if (el.dataset.aktion === 'produkt-kopieren') produktFormStarten(null, el.dataset.id);
        else produktFormStarten(el.dataset.aktion === 'produkt-neu' ? null : el.dataset.id);
        if (aktuelleAnsicht() === 'produkt') zeigen();
        else location.hash = '#produkt';
        break;
      case 'sortiment-filter':
        zustand.nurOhneEinstufung = !zustand.nurOhneEinstufung;
        zeigen();
        break;
      case 'produkt-aktiv':
        produktAktivUmschalten(produktVon(el.dataset.id));
        break;
      case 'weiteres-foto-dazu':
        weiteresFotoDazu(el.dataset.wert);
        break;
      case 'weiteres-foto-weg':
        weiteresFotoWeg(Number(el.dataset.wert));
        break;
      case 'schluessel-kopieren':
        schluesselKopieren();
        break;
      case 'schluessel-fertig':
        neuerSchluessel = null;
        zeigen();
        break;
      case 'kunden-import':
        kundenImportieren();
        break;
      case 'kunden-import-verwerfen':
        zustand.kundenImport = null;
        zeigen();
        break;
      case 'zugang-sperren':
        zugangSperren(el.dataset.id);
        break;
      case 'schnittstelle-pausieren':
        schnittstellePausieren(el.dataset.wert === '1');
        break;
      case 'produkt-verfuegbar':
        produktVerfuegbarUmschalten(produktVon(el.dataset.id));
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
    } else if ((e.target.dataset.artikel || e.target.dataset.erfassenPreis) && e.target.form && e.target.form.id === 'vw-formular') {
      if (e.target.dataset.erfassenPreis) erfassenPreisZeile(e.target);
      formularSummeAktualisieren();
    }
  });

  // „Menge ändern" bleibt offen, auch wenn nach dem Speichern neu gezeichnet wird
  // (toggle steigt nicht auf – daher in der Capture-Phase)
  document.addEventListener('toggle', (e) => {
    const id = e.target.dataset && e.target.dataset.aendern;
    if (id) zustand.aendernOffen = e.target.open ? id : null;
    const mehrId = e.target.dataset && e.target.dataset.detailMehr;
    if (mehrId) zustand.detailMehr = e.target.open ? mehrId : null;
  }, true);
  document.addEventListener('change', (e) => {
    if (e.target.dataset.kundenImport !== undefined) kundenImportDatei(e.target);
    if (e.target.dataset.fotoHochladen !== undefined) produktFotoHochladen(e.target);
    if (e.target.dataset.weiteresFotoHochladen !== undefined) produktFotoHochladen(e.target, true);
    if (e.target.dataset.gewicht) gewichtSpeichern(e.target);
    if (e.target.dataset.stueck) stueckZwischenspeichern(e.target);
    if (e.target.dataset.preisPos) positionPreisSetzen(e.target);
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
    if (e.target.name === 'verkaufsart' && e.target.form && e.target.form.id === 'vw-produkt-formular') {
      document.getElementById('vw-dauer').hidden = e.target.value !== 'dauer';
      document.getElementById('vw-startpreis').hidden = e.target.value === 'dauer';
    }
    if (e.target.name === 'zeitraum') {
      const jahr = document.getElementById('vw-va-jahr');
      if (jahr) jahr.hidden = e.target.value === 'naechste';
    }
    if (e.target.name === 'alle-herkunft' || e.target.name === 'alle-ustSatz') {
      const name = e.target.name.slice(5);
      e.target.form.querySelectorAll(`[data-produkt] [name="${name}"]`).forEach((wahl) => { wahl.value = e.target.value; });
    }
    if (e.target.name === 'va-zeitraum') {
      const jahr = e.target.form && e.target.form.querySelector('[data-va-jahr]');
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
    if (id === 'vw-notiz-formular') {
      e.preventDefault();
      notizSpeichern(e.target);
      return;
    }
    if (id === 'vw-lieferschein-formular') {
      e.preventDefault();
      lieferscheinFormular(e.target);
      return;
    }
    if (id === 'vw-produkt-formular') {
      e.preventDefault();
      produktSpeichern(e.target);
      return;
    }
    if (id === 'vw-einstufen-formular') {
      e.preventDefault();
      einstufungSpeichern(e.target);
      return;
    }
    if (id === 'vw-va-bearbeiten') {
      e.preventDefault();
      vormerkungAendern(e.target);
      return;
    }
    if (id === 'vw-zugang-formular') {
      e.preventDefault();
      zugangAnlegenFormular(e.target);
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

  // Aufgeklappte Menüs (⋯ im Sortiment) schließen, sobald woanders geklickt wird
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.vw-menue[open]').forEach((m) => { if (!m.contains(e.target)) m.open = false; });
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
