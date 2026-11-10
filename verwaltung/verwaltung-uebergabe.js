/* ============================================================
 * HOFLADEN-VERWALTUNG – WIEGEN, ÜBERGABE, VERKAUF AM HOF, ZAHLUNGEN
 * ============================================================
 * Abschnitte 5.4–5.6.
 * Teil von verwaltung/ – Reihenfolge und Überblick: siehe Kopf von verwaltung.js.
 * ============================================================ */

'use strict';

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
    () => { delete p.stueckG; return {}; }, { neuZeichnen: false, still: true });
  input.classList.toggle('vw-feld--fehler', !erg);
}

// 5.5 Übergabe (Abholung und Liefertour)
// Kathrin tippt beim Kunden die Gewichte vom Etikett ab (ein Feld je Stück),
// der Betrag steht sofort da, und ein Knopf erledigt Übergabe und – bei
// Barzahlung – das Kassieren. Vorab wiegen (Ansicht „Wiegen") ist optional.

// Getippte Stückgewichte einer Position (Text, wie eingegeben). Noch nichts
// getippt: die gespeicherten Einzelgewichte (überstehen so ein Neuladen)
function stueckTexte(p) {
  const liste = zustand.stueck[p.id]
    || (p.stueckG && p.stueckG.length === p.menge ? p.stueckG.map((g) => (g ? kgFormat.format(g / 1000) : '')) : []);
  return Array.from({ length: p.menge }, (_, i) => liste[i] || '');
}

// Einzelgewichte in Gramm (null = leer oder ungültig)
const stueckGramm = (p) => stueckTexte(p).map((t) => grammAusText(t) || null);

// Alle Stücke gewogen? Dann „3,52 · 3,61 · … kg" (Lieferschein, Details)
function einzelgewichteText(p) {
  const g = p.stueckG;
  if (!g || g.length !== p.menge || g.length < 2 || !g.every(Boolean)) return '';
  return `${g.map((x) => kgFormat.format(x / 1000)).join(' · ')} kg`;
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
  if (!zustand.stueck[p.id] && p.stueckG && p.stueckG.every(Boolean)) return p.gewichtG || null;
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
        ${istUeberfaellig(b) || notizVon(b) ? `<span class="vw-zeile-stand vw-zeile-stand--marken">${istUeberfaellig(b)
          ? `<span class="vw-marke vw-marke--offen">${ueberfaelligText(b)}</span>` : ''}${notizVon(b) ? `<span>Notiz: ${esc(notizVon(b))}</span>` : ''}</span>` : ''}
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
    <div class="vw-kopf"><h1>Übergabe</h1>${chargeWahl()}${rundenReiter('uebergabe')}
      <div class="vw-segment" role="group" aria-label="Abholung oder Lieferung">
        <button type="button" data-aktion="uebergabe-art" data-wert="abholung" aria-pressed="${!lieferung}">Abholung <span class="vw-anzahl">${anzahl('abholung')}</span></button>
        <button type="button" data-aktion="uebergabe-art" data-wert="lieferung" aria-pressed="${lieferung}">Liefertour <span class="vw-anzahl">${anzahl('lieferung')}</span></button>
      </div>
      ${tage || (termine.length ? `<p class="vw-klein">${termine.map(terminText).join(' · ')}</p>` : '')}
      ${ohneTermin ? `<p><button type="button" class="vw-link" data-aktion="filter" data-wert="termin-offen">${ohneTermin} Bestellungen ohne Termin ›</button></p>` : ''}
    </div>
    ${routen.map((r) => `<a class="vw-knopf vw-knopf--voll vw-knopf--breit" href="${r.url}" target="_blank" rel="noopener">${esc(r.text)}</a>`).join('')}
    ${sortiert.length ? `<div class="vw-fortschritt" role="status"><span class="vw-balken" aria-hidden="true"><span style="width:${Math.round((erledigt.length / sortiert.length) * 100)}%"></span></span>
      <span class="vw-klein">${erledigt.length} von ${sortiert.length} übergeben</span></div>` : ''}
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
    ${b.anmerkung ? `<p class="vw-hinweis">„${esc(b.anmerkung)}"</p>` : ''}
    ${notizVon(b) ? `<p class="vw-hinweis">Notiz: ${esc(notizVon(b))}</p>` : ''}</div>`;

  // Schon übergeben: Stand und das, was noch zu tun sein kann
  if (b.uebergeben) {
    inhalt().innerHTML = `${kopf}
      <section class="vw-karte">
        <p>${esc(artikelKurz(b))}</p>
        <div class="vw-summe"><span>Summe</span><strong>${betragText(bestellBetrag(b))}</strong></div>
        <p class="${b.bezahlt ? '' : 'vw-warnung'}">✓ Übergeben · ${b.bezahlt ? `bezahlt (${ZAHLARTEN[b.bezahlt]})` : 'Geld noch nicht da'}</p>
        ${b.bezahlt ? '' : `<button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit vw-knopf--gross" data-aktion="bezahlt" data-wert="${b.zahlart}" data-id="${b.id}">${b.zahlart === 'bar' ? 'Bar erhalten' : 'Geld ist am Konto'}</button>
          <button type="button" class="vw-link" data-aktion="zahlungsinfo" data-id="${b.id}">Zahlungsinfo mit QR-Code zeigen</button>`}
        <p><button type="button" class="vw-link" data-aktion="lieferschein" data-id="${b.id}">Lieferschein drucken</button></p>
      </section>
      ${kontakt}
      <p><button type="button" class="vw-link vw-link--leise" data-aktion="uebergeben" data-id="${b.id}">Übergabe rückgängig machen</button></p>`;
    return;
  }

  const positionen = b.positionen.map((p) => {
    const a = artikelVon(ch, p.artikelId);
    const gewicht = a.art === 'gewicht';
    return `<div class="vw-pos">
      <div class="vw-pos-kopf"><strong>${p.menge}× ${esc(a.name)}</strong>
        <span class="vw-klein">${gewicht ? `${euro(preisVon(ch, p))}/kg` : `je ${euro(preisVon(ch, p))}`}</span></div>
      ${preisFeld(b, p, false)}
      ${gewicht ? `<div class="vw-stueck">${stueckTexte(p).map((txt, i) => `<input type="text" inputmode="decimal" autocomplete="off"
          placeholder="Stück ${i + 1}" value="${esc(txt)}" data-stueck="${p.id}" data-bestellung="${b.id}" data-nr="${i}"
          aria-label="${esc(a.name)} Stück ${i + 1}, Gewicht in kg" />`).join('')}</div>
        ${p.gewichtG && !(p.stueckG || []).some(Boolean) ? `<p class="vw-klein">Vorab gewogen: ${kg(p.gewichtG)} – nur ausfüllen, wenn es andere Stücke werden.</p>` : ''}` : ''}
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
      ${mengeAendernBlock(b)}
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
  const p = b.positionen.find((x) => x.id === input.dataset.stueck);
  // gespeicherte Einzelgewichte als Ausgangspunkt, damit keines verloren geht
  const liste = zustand.stueck[input.dataset.stueck] || (p ? stueckTexte(p) : []);
  liste[Number(input.dataset.nr)] = input.value;
  zustand.stueck[input.dataset.stueck] = liste;
  const text = betragText(uebergabeBetrag(b));
  document.querySelectorAll(`[data-betrag="${b.id}"]`).forEach((el) => { el.textContent = text; });
  input.classList.toggle('vw-feld--fehler', Boolean(input.value.trim()) && !grammAusText(input.value));
}

// Beim Verlassen eines Stückfelds im Hintergrund speichern – bei 15 Gänsen
// geht so nichts verloren, wenn das Handy die Seite neu lädt
async function stueckZwischenspeichern(input) {
  const b = bestellungVon(input.dataset.bestellung);
  const p = b && b.positionen.find((x) => x.id === input.dataset.stueck);
  if (!p || b.uebergeben) return;
  const gewichte = stueckGramm(p);
  const erg = await speichern(`bestellung/${b.id}`, { aktion: 'stueck', positionId: p.id, gewichte }, () => {
    p.stueckG = gewichte;
    if (gewichte.every(Boolean)) p.gewichtG = gewichte.reduce((s, g) => s + g, 0);
    return { gespeichert: true };
  }, { neuZeichnen: false, still: true });
  input.classList.toggle('vw-feld--fehler', !erg || (Boolean(input.value.trim()) && !grammAusText(input.value)));
}

async function uebergabeAbschliessen(b, zahlung) {
  const ch = chargeVon(b);
  const gewichte = [];
  for (const p of b.positionen) {
    if (artikelVon(ch, p.artikelId).art !== 'gewicht') continue;
    const g = wirksamesGewicht(p);
    if (!g) return meldung(`Bitte bei ${kundeVon(b).name} alle Gewichte eintragen.`);
    const stueck = stueckGramm(p);
    if (stueck.every(Boolean)) gewichte.push({ positionId: p.id, gewichtG: g, stueck });
    else if (g !== p.gewichtG) gewichte.push({ positionId: p.id, gewichtG: g });
  }
  const erg = await speichern(`bestellung/${b.id}`, { aktion: 'abschliessen', zahlung: zahlung || null, gewichte }, () => {
    gewichte.forEach((g) => {
      const p = b.positionen.find((x) => x.id === g.positionId);
      p.gewichtG = g.gewichtG;
      if (g.stueck) p.stueckG = g.stueck;
    });
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

// „Menge ändern oder Artikel dazu" – bei der Übergabe und in den Details
// einer vorgemerkten Bestellung (z. B. Kunde will eine zweite Gans). Bleibt
// nach jedem Tippen offen (zustand.aendernOffen), weil neu gezeichnet wird.
function mengeAendernBlock(b) {
  const ch = chargeVon(b);
  const warteliste = b.status === 'warteliste';
  const dazu = ch.artikel.filter((a) => !b.positionen.some((p) => p.artikelId === a.id) && (warteliste || freieMenge(ch, a.id) > 0));
  return `<details class="vw-aendern" data-aendern="${b.id}" ${zustand.aendernOffen === b.id || warteliste ? 'open' : ''}>
    <summary>Menge ändern oder Artikel dazu</summary>
    ${warteliste ? '<p class="vw-klein">Reicht es nicht für alles? Menge auf das Freie senken, dann „Nachrücken lassen".</p>' : ''}
    ${b.positionen.map((p) => {
      const a = artikelVon(ch, p.artikelId);
      return `<div class="vw-pos-kopf vw-pos-aendern"><span>${esc(a.name)}<br><span class="vw-klein">${freiText(ch, a.id)}</span></span>
        <div class="vw-zaehler">
          <button type="button" data-aktion="pos-menge" data-id="${b.id}" data-artikel="${a.id}" data-wert="${p.menge - 1}" aria-label="${esc(a.name)} eins weniger">−</button>
          <output>${p.menge}</output>
          <button type="button" data-aktion="pos-menge" data-id="${b.id}" data-artikel="${a.id}" data-wert="${p.menge + 1}" aria-label="${esc(a.name)} eins mehr">+</button>
        </div></div>`;
    }).join('')}
    ${dazu.length ? `<select class="vw-dazu" data-dazu="${b.id}" aria-label="Artikel dazu">
      <option value="">+ Artikel dazu …</option>
      ${dazu.map((a) => `<option value="${a.id}">${esc(a.name)} (${freiText(ch, a.id)})</option>`).join('')}</select>` : ''}
    ${b.positionen.some((p) => artikelVon(ch, p.artikelId).art === 'gewicht')
      ? '<p class="vw-klein">Bei Ware nach Gewicht wird ein schon eingetragenes Gewicht beim Ändern der Stückzahl gelöscht – bitte neu wiegen.</p>' : ''}
  </details>`;
}

// Gemerkter Preis eines Kunden für ein Produkt (Gasthaus-Preis) oder undefined
function kundenPreis(kundeId, produktId) {
  const k = (daten.kundenPreise || []).find((x) => x.kundeId === kundeId && x.produktId === produktId);
  return k ? k.preisCent : undefined;
}

// Preisfeld einer Position (Details, Übergabe) – eingeklappt, solange
// nicht bezahlt. Ein eigener Preis wird für den Kunden gemerkt; gibt es einen
// gemerkten, der hier noch nicht gilt (z. B. Website-Bestellung), steht ein
// Knopf zum Übernehmen daneben.
function preisFeld(b, p, mitName = true) {
  const ch = chargeVon(b);
  const a = artikelVon(ch, p.artikelId);
  if (b.bezahlt || !['vorgemerkt', 'warteliste'].includes(b.status)) return '';
  const preis = preisVon(ch, p);
  const sonder = preis !== a.preisCent;
  const gemerkt = kundenPreis(b.kundeId, a.produktId);
  const vorschlag = gemerkt !== undefined && gemerkt !== preis
    ? `<button type="button" class="vw-knopf vw-knopf--klein" data-aktion="preis-gemerkt" data-id="${b.id}" data-pos="${p.id}" data-wert="${gemerkt}">
        Preis vom letzten Mal: ${euro(gemerkt)}${a.art === 'gewicht' ? '/kg' : ''} übernehmen</button>` : '';
  // Eingeklappt, weil selten gebraucht; offen, wenn schon ein Sonderpreis gilt
  // oder einer vom letzten Mal zum Übernehmen bereitsteht
  return `<details class="vw-preis-aendern${sonder ? ' vw-preis-aendern--sonder' : ''}"${sonder || vorschlag ? ' open' : ''}>
    <summary>${sonder ? `Sonderpreis ${preisKurz(a, preis)}` : (mitName ? `Preis ${esc(a.name)}` : '')}${sonder || mitName ? ' · ' : ''}<span class="vw-preis-aendern-wort">${sonder || mitName ? 'ändern' : 'Preis ändern'}</span></summary>
    <label class="vw-pos-preis${sonder ? ' vw-pos-preis--sonder' : ''}">
    <span>Preis${a.art === 'gewicht' ? ' €/kg' : ' €'}</span>
    <input type="text" inputmode="decimal" autocomplete="off" value="${textAusCent(preis)}"
      data-preis-pos="${p.id}" data-bestellung="${b.id}" aria-label="Preis ${esc(a.name)} für diese Bestellung" />
    <span class="vw-klein">${sonder ? `sonst ${euro(a.preisCent)} – wird für ${esc(kundeVon(b).name)} gemerkt` : 'Nur für diese Bestellung; wird für den Kunden gemerkt.'}</span></label>
    ${vorschlag}</details>`;
}

// Eigener Preis für diese Bestellung (z. B. Gasthaus bei großer Menge)
function positionPreisSetzen(input) {
  const b = bestellungVon(input.dataset.bestellung);
  const p = b && b.positionen.find((x) => x.id === input.dataset.preisPos);
  if (!p) return;
  const preisCent = centAusText(input.value);
  if (preisCent == null) { input.value = textAusCent(preisVon(chargeVon(b), p)); return meldung('Bitte einen gültigen Preis eintragen.'); }
  if (preisCent === preisVon(chargeVon(b), p)) return;
  preisSpeichern(b, p, preisCent);
}

function preisSpeichern(b, p, preisCent) {
  const ch = chargeVon(b);
  const a = artikelVon(ch, p.artikelId);
  const sonder = preisCent !== a.preisCent;
  speichern(`bestellung/${b.id}`, { aktion: 'preis', positionId: p.id, preisCent }, () => {
    p.einzelpreisCent = preisCent;
    daten.kundenPreise = (daten.kundenPreise || []).filter((x) => !(x.kundeId === b.kundeId && x.produktId === a.produktId));
    if (sonder) daten.kundenPreise.push({ kundeId: b.kundeId, produktId: a.produktId, preisCent });
    return {};
  }, { erfolg: `${kundeVon(b).name}: Preis ${euro(preisCent)} gespeichert${sonder ? ' und für nächstes Mal gemerkt' : ''}.` });
}

// Menge eines Artikels ändern bzw. Artikel dazu (bei der Übergabe)
function positionMengeSetzen(b, artikelId, menge) {
  const ch = chargeVon(b);
  const pos = b.positionen.find((p) => p.artikelId === artikelId);
  const alt = pos ? pos.menge : 0;
  if (menge < 0) return;
  if (menge === 0 && b.positionen.length === 1) return meldung('Der letzte Artikel kann nicht entfernt werden – Bestellung stattdessen in den Details stornieren.');
  // Auf der Warteliste zählt nichts von der Menge ab – dort frei ändern
  if (b.status === 'vorgemerkt' && menge > alt && freieMenge(ch, artikelId) < menge - alt) return meldung(`Nicht genug frei – noch ${Math.max(0, freieMenge(ch, artikelId))} verfügbar.`);
  if (pos) delete zustand.stueck[pos.id];
  speichern(`bestellung/${b.id}`, { aktion: 'position', artikelId, menge }, () => {
    if (menge === 0) b.positionen = b.positionen.filter((p) => p !== pos);
    else if (pos) { pos.menge = menge; pos.gewichtG = undefined; delete pos.stueckG; } else {
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
        return `<div class="vw-pos">
          <div class="vw-pos-kopf">
            <div><strong>${esc(a.name)}</strong><br><span class="vw-klein">${a.art === 'gewicht' ? `${euro(a.preisCent)}/kg` : euro(a.preisCent)} · ${freiText(ch, a.id)}</span></div>
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
      <div class="vw-speicherleiste">
        <div class="vw-summe"><span>Summe</span><strong data-hofbetrag>${betrag}</strong></div>
        <button type="button" class="vw-knopf vw-knopf--voll vw-knopf--breit vw-knopf--gross" data-aktion="hof-speichern" data-wert="bar">Verkauft · bar kassiert</button>
      </div>
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
    positionen.push({ artikelId: a.id, menge, gewichtG, ...(a.art === 'gewicht' ? { stueck: hofStueckTexte(a.id).map(grammAusText) } : {}) });
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
        ...(p.stueck ? { stueckG: p.stueck } : {}),
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
    <div class="vw-kopf"><h1>Zahlungen</h1>${chargeWahl()}${rundenReiter('zahlungen')}</div>
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
