/* ============================================================
 * VERWALTUNG – FREILANDEIER (verwaltung/eier.html)
 * ============================================================
 * 1. Anmeldungen aus dem Formular „Kunde werden" (freilandeier.html):
 *    Liste mit Filter, Status ändern (neu → warteliste → angenommen /
 *    abgelehnt), interne Notiz, löschen und CSV-Export für Bertha.
 *    Keine automatische Übergabe an Bertha – Kunden dort von Hand anlegen.
 * 2. „Aktuelles vom Stall": kurze, datierte Einträge anlegen, ändern,
 *    aus- und einblenden, löschen.
 *
 * Schnittstelle: /api/verwaltung/eier/… (functions/_lib/eier.js), Zugang
 * wie die übrige Verwaltung über Cloudflare Access.
 * Beispielmodus: eier.html?entwurf – erfundene Daten nur im Arbeitsspeicher.
 * Nichts wird im Browser gespeichert (kein localStorage, siehe CLAUDE.md).
 * ============================================================ */
'use strict';

(function () {
  const BEISPIEL = new URLSearchParams(location.search).has('entwurf');
  const API = '/api/verwaltung/eier/';
  const STATUS = { neu: 'Neu', warteliste: 'Warteliste', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt' };
  const RHYTHMUS = { woechentlich: 'wöchentlich', '14-taegig': '14-tägig' };
  const ABSTELLORTE = {
    haustuer: 'vor der Haustür', garage: 'in der Garage / im Carport',
    persoenlich: 'persönlich übergeben', anderer: 'anderer Ort',
  };
  const HERKUNFT = { empfehlung: 'Empfehlung', internet: 'Internet / Website', hof: 'am Hof / bei uns gekauft', anderes: 'anderes' };
  const GEBIET = { ja: 'im Liefergebiet', moeglich: 'Brixlegg – könnten wir dazunehmen', nein: 'außerhalb des Liefergebiets' };

  let daten = null;          // { anmeldungen, neuigkeiten }
  let filter = 'offen';      // offen = neu + warteliste
  let bearbeiten = null;     // ID des Eintrags „Aktuelles", der gerade bearbeitet wird
  let beschaeftigt = false;

  const $ = (id) => document.getElementById(id);
  const esc = (w) => String(w == null ? '' : w)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const heute = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const datumText = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('de-AT', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  /* ----------------------------------------------------------
     LADEN UND SPEICHERN
     ---------------------------------------------------------- */
  async function laden() {
    if (BEISPIEL) {
      daten = beispielDaten();
      return zeigen();
    }
    try {
      const antwort = await fetch(`${API}stand`, { headers: { Accept: 'application/json' } });
      const erg = await antwort.json();
      if (!erg.ok) throw new Error(erg.error || 'Fehler');
      daten = { anmeldungen: erg.anmeldungen, neuigkeiten: erg.neuigkeiten };
      zeigen();
    } catch (fehler) {
      $('ei-anmeldungen').innerHTML = `<h2>Anmeldungen</h2><p class="vw-warnung">Laden hat nicht geklappt: ${esc(fehler.message)}.
        Ist <code>schema-eier.sql</code> in der Datenbank eingespielt?</p>`;
      $('ei-aktuelles').innerHTML = '';
    }
  }

  async function senden(pfad, eingabe) {
    if (beschaeftigt) return null;
    beschaeftigt = true;
    try {
      if (BEISPIEL) return beispielSenden(pfad, eingabe);
      const antwort = await fetch(API + pfad, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eingabe || {}),
      });
      const erg = await antwort.json().catch(() => ({}));
      if (!erg.ok) throw new Error(erg.error || `Fehler ${antwort.status}`);
      return erg;
    } catch (fehler) {
      meldung(fehler.message);
      return null;
    } finally {
      beschaeftigt = false;
    }
  }

  let toastZeit = null;
  function meldung(text) {
    const t = $('ei-toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('vw-toast--sichtbar');
    clearTimeout(toastZeit);
    toastZeit = setTimeout(() => t.classList.remove('vw-toast--sichtbar'), 3500);
  }

  /* ----------------------------------------------------------
     1. ANMELDUNGEN
     ---------------------------------------------------------- */
  const passt = (a) => (filter === 'alle' ? true : filter === 'offen' ? ['neu', 'warteliste'].includes(a.status) : a.status === filter);
  const filterStatus = () => (filter === 'alle' ? '' : filter === 'offen' ? 'neu,warteliste' : filter);

  function anmeldungenZeigen() {
    const alle = daten.anmeldungen;
    const zaehle = (f) => alle.filter((a) => (f === 'alle' ? true : f === 'offen' ? ['neu', 'warteliste'].includes(a.status) : a.status === f)).length;
    const filterliste = [['offen', 'Offen'], ['neu', 'Neu'], ['warteliste', 'Warteliste'], ['angenommen', 'Angenommen'], ['abgelehnt', 'Abgelehnt'], ['alle', 'Alle']];
    const liste = alle.filter(passt);
    // Gleiche E-Mail mehrmals angemeldet?
    const proMail = {};
    alle.forEach((a) => { proMail[a.email] = (proMail[a.email] || 0) + 1; });
    const exportPfad = `${API}export${filterStatus() ? `?status=${filterStatus()}` : ''}`;

    $('ei-anmeldungen').innerHTML = `
      <h2 id="ei-anm-titel">Anmeldungen</h2>
      <div class="vw-chips" role="group" aria-label="Filter">
        ${filterliste.map(([wert, text]) => `<button type="button" class="vw-chip" data-aktion="filter" data-wert="${wert}"
          aria-pressed="${filter === wert}">${text} (${zaehle(wert)})</button>`).join('')}
      </div>
      <div class="vw-knopfreihe">
        ${BEISPIEL ? '<span class="vw-klein">CSV-Export im Beispielmodus nicht verfügbar.</span>'
          : `<a class="vw-knopf" href="${esc(exportPfad)}" download>Diese Liste als CSV (Excel / Bertha)</a>`}
      </div>
      ${liste.length ? `<ul class="ei-liste">${liste.map((a) => anmeldungHtml(a, proMail[a.email] > 1)).join('')}</ul>`
        : '<p class="vw-klein">Keine Anmeldungen in dieser Auswahl.</p>'}`;
  }

  function anmeldungHtml(a, doppelt) {
    const tel = a.telefon.replace(/[^\d+]/g, '');
    const herkunft = a.herkunft ? HERKUNFT[a.herkunft] + (a.empfohlenVon ? ` – ${a.empfohlenVon}` : '') : '';
    return `<li class="ei-anmeldung ei-status--${a.status}">
      <div class="ei-anmeldung-kopf">
        <strong>${esc(a.name)}</strong>
        <span class="ei-marke ei-marke--${a.status}">${STATUS[a.status]}</span>
      </div>
      <p class="ei-zeile">${esc(a.strasse)}, ${esc(a.plz)} ${esc(a.ort)}
        <span class="ei-gebiet ei-gebiet--${a.gebiet}">${GEBIET[a.gebiet]}</span></p>
      <p class="ei-zeile"><strong>${a.schachteln} ${a.schachteln === 1 ? 'Schachtel' : 'Schachteln'}</strong>, ${RHYTHMUS[a.rhythmus] || esc(a.rhythmus)}
        · ${esc(ABSTELLORTE[a.abstellort] || a.abstellort)}${a.abstellortHinweis ? `: ${esc(a.abstellortHinweis)}` : ''}</p>
      <p class="ei-zeile"><a href="tel:${esc(tel)}">${esc(a.telefon)}</a> · <a href="mailto:${esc(a.email)}">${esc(a.email)}</a></p>
      <p class="vw-klein">Angemeldet am ${datumText(a.erstelltAm)}${herkunft ? ` · erfahren über: ${esc(herkunft)}` : ''}
        · Neuigkeiten: ${a.neuigkeiten ? 'ja' : 'nein'}${doppelt ? ' · <span class="vw-warnung">mehrfach angemeldet</span>' : ''}</p>
      <div class="vw-chips" role="group" aria-label="Status von ${esc(a.name)}">
        ${Object.entries(STATUS).map(([wert, text]) => `<button type="button" class="vw-chip" data-aktion="status" data-id="${a.id}" data-wert="${wert}"
          aria-pressed="${a.status === wert}"${a.status === wert ? ' disabled' : ''}>${text}</button>`).join('')}
      </div>
      <details class="ei-mehr">
        <summary>Notiz${a.notiz ? ': ' + esc(a.notiz.slice(0, 40)) + (a.notiz.length > 40 ? ' …' : '') : ''} · Löschen</summary>
        <form class="ei-notiz" data-id="${a.id}" novalidate>
          <label class="vw-feld"><span>Interne Notiz (sieht der Interessent nie)</span>
            <textarea name="notiz" rows="2" maxlength="1000" placeholder="z. B. angerufen am …, startet im April">${esc(a.notiz || '')}</textarea></label>
          <div class="vw-knopfreihe">
            <button type="submit" class="vw-knopf vw-knopf--klein">Notiz speichern</button>
            <button type="button" class="vw-knopf vw-knopf--klein ei-gefahr" data-aktion="loeschen" data-id="${a.id}">Anmeldung löschen</button>
          </div>
        </form>
      </details>
    </li>`;
  }

  /* ----------------------------------------------------------
     2. AKTUELLES VOM STALL
     ---------------------------------------------------------- */
  function aktuellesZeigen() {
    const e = bearbeiten ? daten.neuigkeiten.find((n) => n.id === bearbeiten) : null;
    $('ei-aktuelles').innerHTML = `
      <h2 id="ei-akt-titel">Aktuelles vom Stall</h2>
      <p class="vw-klein">Erscheint auf freilandeier.html, neueste zuerst (höchstens sechs). Kurz halten – ein, zwei Sätze.</p>
      <form id="ei-neuigkeit" class="ei-neuigkeit-form" novalidate>
        <h3>${e ? 'Eintrag ändern' : 'Neuer Eintrag'}</h3>
        <div class="ei-zwei">
          <label class="vw-feld"><span>Datum</span><input type="date" name="datum" required value="${esc(e ? e.datum : heute())}" /></label>
          <label class="vw-feld"><span>Überschrift</span><input type="text" name="titel" required maxlength="120" value="${esc(e ? e.titel : '')}" /></label>
        </div>
        <label class="vw-feld"><span>Text</span><textarea name="text" rows="3" required maxlength="1500">${esc(e ? e.text : '')}</textarea></label>
        <label class="ei-haken"><input type="checkbox" name="sichtbar" ${!e || e.sichtbar ? 'checked' : ''} /> auf der Website zeigen</label>
        <div class="vw-knopfreihe">
          <button type="submit" class="vw-knopf vw-knopf--voll">${e ? 'Änderung speichern' : 'Eintrag anlegen'}</button>
          ${e ? '<button type="button" class="vw-knopf" data-aktion="abbrechen">Abbrechen</button>' : ''}
        </div>
      </form>
      ${daten.neuigkeiten.length ? `<ul class="ei-liste">${daten.neuigkeiten.map((n) => `
        <li class="ei-eintrag${n.sichtbar ? '' : ' ei-eintrag--aus'}">
          <p class="vw-klein">${datumText(n.datum)}${n.sichtbar ? '' : ' · <strong>ausgeblendet</strong>'}</p>
          <strong>${esc(n.titel)}</strong>
          <p class="ei-text">${esc(n.text)}</p>
          <div class="vw-knopfreihe">
            <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="bearbeiten" data-id="${n.id}">Ändern</button>
            <button type="button" class="vw-knopf vw-knopf--klein" data-aktion="sichtbar" data-id="${n.id}">${n.sichtbar ? 'Ausblenden' : 'Einblenden'}</button>
            <button type="button" class="vw-knopf vw-knopf--klein ei-gefahr" data-aktion="eintrag-loeschen" data-id="${n.id}">Löschen</button>
          </div>
        </li>`).join('')}</ul>` : '<p class="vw-klein">Noch keine Einträge.</p>'}`;
  }

  function zeigen() {
    anmeldungenZeigen();
    aktuellesZeigen();
  }

  /* ----------------------------------------------------------
     EREIGNISSE
     ---------------------------------------------------------- */
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-aktion]');
    if (!el || !daten) return;
    const { aktion, id, wert } = el.dataset;
    if (aktion === 'filter') {
      filter = wert;
      anmeldungenZeigen();
    } else if (aktion === 'status') {
      if (await senden(`anmeldung/${id}`, { status: wert })) {
        daten.anmeldungen.find((a) => a.id === id).status = wert;
        anmeldungenZeigen();
        meldung(`Status: ${STATUS[wert]}`);
      }
    } else if (aktion === 'loeschen') {
      const a = daten.anmeldungen.find((x) => x.id === id);
      if (!confirm(`Anmeldung von ${a.name} endgültig löschen?`)) return;
      if (await senden(`anmeldung/${id}/loeschen`)) {
        daten.anmeldungen = daten.anmeldungen.filter((x) => x.id !== id);
        anmeldungenZeigen();
        meldung('Anmeldung gelöscht.');
      }
    } else if (aktion === 'bearbeiten') {
      bearbeiten = id;
      aktuellesZeigen();
      $('ei-neuigkeit')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (aktion === 'abbrechen') {
      bearbeiten = null;
      aktuellesZeigen();
    } else if (aktion === 'sichtbar') {
      const n = daten.neuigkeiten.find((x) => x.id === id);
      const neu = { datum: n.datum, titel: n.titel, text: n.text, sichtbar: !n.sichtbar };
      if (await senden(`neuigkeit/${id}`, neu)) {
        n.sichtbar = neu.sichtbar;
        aktuellesZeigen();
        meldung(n.sichtbar ? 'Eintrag wird gezeigt.' : 'Eintrag ausgeblendet.');
      }
    } else if (aktion === 'eintrag-loeschen') {
      const n = daten.neuigkeiten.find((x) => x.id === id);
      if (!confirm(`Eintrag „${n.titel}" löschen?`)) return;
      if (await senden(`neuigkeit/${id}/loeschen`)) {
        daten.neuigkeiten = daten.neuigkeiten.filter((x) => x.id !== id);
        if (bearbeiten === id) bearbeiten = null;
        aktuellesZeigen();
        meldung('Eintrag gelöscht.');
      }
    }
  });

  document.addEventListener('submit', async (ev) => {
    const form = ev.target;
    if (form.classList.contains('ei-notiz')) {
      ev.preventDefault();
      const id = form.dataset.id;
      const notiz = form.elements.notiz.value.trim();
      if (await senden(`anmeldung/${id}`, { notiz })) {
        daten.anmeldungen.find((a) => a.id === id).notiz = notiz || null;
        anmeldungenZeigen();
        meldung('Notiz gespeichert.');
      }
    } else if (form.id === 'ei-neuigkeit') {
      ev.preventDefault();
      const eintrag = {
        datum: form.elements.datum.value,
        titel: form.elements.titel.value.trim(),
        text: form.elements.text.value.trim(),
        sichtbar: form.elements.sichtbar.checked,
      };
      if (!eintrag.datum || !eintrag.titel || !eintrag.text) {
        meldung('Bitte Datum, Überschrift und Text ausfüllen.');
        return;
      }
      const erg = await senden(bearbeiten ? `neuigkeit/${bearbeiten}` : 'neuigkeit', eintrag);
      if (!erg) return;
      if (bearbeiten) Object.assign(daten.neuigkeiten.find((n) => n.id === bearbeiten), eintrag);
      else daten.neuigkeiten.push({ id: erg.id, ...eintrag });
      daten.neuigkeiten.sort((x, y) => (y.datum.localeCompare(x.datum)) || (Number(y.id) - Number(x.id)));
      meldung(bearbeiten ? 'Änderung gespeichert.' : 'Eintrag angelegt.');
      bearbeiten = null;
      aktuellesZeigen();
    }
  });

  /* ----------------------------------------------------------
     BEISPIELMODUS – frei erfundene Daten, nur zum Ausprobieren
     ---------------------------------------------------------- */
  function beispielDaten() {
    const hinweis = $('ei-beispiel-hinweis');
    if (hinweis) hinweis.hidden = false;
    return {
      anmeldungen: [
        { id: '3', erstelltAm: '2026-11-16 18:02:00', status: 'neu', name: 'Beispiel Anna', strasse: 'Musterweg 1', plz: '6250', ort: 'Kundl',
          gebiet: 'ja', telefon: '+43 660 0000001', email: 'anna@example.at', schachteln: 2, rhythmus: 'woechentlich',
          abstellort: 'haustuer', abstellortHinweis: '', herkunft: 'empfehlung', empfohlenVon: 'Beispiel Familie', neuigkeiten: true, notiz: null },
        { id: '2', erstelltAm: '2026-11-12 09:40:00', status: 'warteliste', name: 'Beispiel Bernd', strasse: 'Musterstraße 5', plz: '6230', ort: 'Brixlegg',
          gebiet: 'moeglich', telefon: '0660 0000002', email: 'bernd@example.at', schachteln: 1, rhythmus: '14-taegig',
          abstellort: 'anderer', abstellortHinweis: 'Holzkiste beim Gartentor', herkunft: 'internet', empfohlenVon: null, neuigkeiten: false, notiz: 'Beispielnotiz' },
        { id: '1', erstelltAm: '2026-11-02 20:15:00', status: 'abgelehnt', name: 'Beispiel Clara', strasse: 'Beispielgasse 3', plz: '6300', ort: 'Wörgl',
          gebiet: 'nein', telefon: '0660 0000003', email: 'clara@example.at', schachteln: 3, rhythmus: 'woechentlich',
          abstellort: 'persoenlich', abstellortHinweis: '', herkunft: '', empfohlenVon: null, neuigkeiten: false, notiz: null },
      ],
      neuigkeiten: [
        { id: '1', datum: heute(), titel: 'Beispiel-Eintrag', text: 'So sieht ein Eintrag aus. Frei erfunden.', sichtbar: true },
      ],
    };
  }
  let beispielId = 100;
  function beispielSenden(pfad) {
    meldung('Beispielmodus – nichts gespeichert.');
    return pfad === 'neuigkeit' ? { ok: true, id: String(++beispielId) } : { ok: true };
  }

  laden();
})();
