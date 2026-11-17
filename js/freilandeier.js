/* ============================================================
 * FREILANDEIER (freilandeier.html)
 * ============================================================
 * 1. Formular „Kunde werden": Felder ein-/ausblenden, prüfen und an
 *    /api/eier/anmeldung schicken (functions/api/eier/[[pfad]].js).
 *    Die Prüfung im Browser ist nur Komfort – maßgeblich ist der Server.
 * 2. „Aktuelles vom Stall": Einträge von /api/eier/neuigkeiten laden
 *    (gepflegt in der Verwaltung, verwaltung/eier.html).
 * Nichts wird im Browser gespeichert (kein localStorage, siehe CLAUDE.md).
 * ============================================================ */
'use strict';

/* ------------------------------------------------------------
   1. FORMULAR „KUNDE WERDEN"
   ------------------------------------------------------------ */
function initEierFormular() {
  const form = document.getElementById('eier-form');
  if (!form) return;

  const abstellort = form.querySelector('#eier-abstellort');
  const hinweis = form.querySelector('#eier-abstellhinweis');
  const hinweisArt = form.querySelector('#eier-abstellhinweis-art');
  const herkunft = form.querySelector('#eier-herkunft');
  const empfohlen = form.querySelector('#eier-empfohlen-gruppe');

  // Bei „anderer Ort" ist der Hinweis Pflicht
  function abstellortAnpassen() {
    const pflicht = abstellort && abstellort.value === 'anderer';
    if (hinweis) hinweis.required = pflicht;
    if (hinweisArt) {
      hinweisArt.textContent = pflicht ? '(Pflichtfeld)' : '(optional)';
      hinweisArt.className = pflicht ? 'pflicht' : 'optional';
    }
  }
  // „Wer hat uns empfohlen?" nur bei Empfehlung
  function herkunftAnpassen() {
    if (empfohlen) empfohlen.hidden = !(herkunft && herkunft.value === 'empfehlung');
  }
  abstellort?.addEventListener('change', abstellortAnpassen);
  herkunft?.addEventListener('change', herkunftAnpassen);
  abstellortAnpassen();
  herkunftAnpassen();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const feld = (name) => (form.elements[name]?.value || '').trim();
    const daten = {
      'bot-field': feld('bot-field'),
      name: feld('name'),
      strasse: feld('strasse'),
      plz: feld('plz'),
      ort: feld('ort'),
      telefon: feld('telefon'),
      email: feld('email'),
      schachteln: Number(feld('schachteln')),
      rhythmus: form.querySelector('input[name="rhythmus"]:checked')?.value || '',
      abstellort: feld('abstellort'),
      abstellortHinweis: feld('abstellortHinweis'),
      herkunft: feld('herkunft'),
      empfohlenVon: empfohlen && !empfohlen.hidden ? feld('empfohlenVon') : '',
      datenschutz: Boolean(form.elements.datenschutz?.checked),
      neuigkeiten: Boolean(form.elements.neuigkeiten?.checked),
    };

    // Erstes fehlendes Pflichtfeld markieren und hinspringen
    const fehlt = Array.from(form.querySelectorAll('[required]')).find((el) =>
      (el.type === 'checkbox' ? !el.checked : !el.value.trim()));
    if (fehlt) {
      meldung(form, fehlt.type === 'checkbox'
        ? 'Bitte bestätigt den Datenschutzhinweis.'
        : 'Bitte füllt alle Pflichtfelder aus.', 'error');
      fehlt.focus();
      return;
    }
    if (!/^\d{4}$/.test(daten.plz)) {
      meldung(form, 'Bitte gebt eine gültige Postleitzahl an (4 Ziffern).', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(daten.email)) {
      meldung(form, 'Bitte gebt eine gültige E-Mail-Adresse ein.', 'error');
      return;
    }

    const knopf = form.querySelector('button[type="submit"]');
    const knopfText = knopf?.textContent;
    if (knopf) {
      knopf.disabled = true;
      knopf.textContent = 'Wird gesendet …';
    }

    fetch('/api/eier/anmeldung', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(daten),
    })
      .then(async (antwort) => {
        const erg = await antwort.json().catch(() => ({}));
        if (antwort.status === 400 && erg.error) {
          meldung(form, erg.error, 'error');
          return;
        }
        if (!antwort.ok || !erg.ok) throw new Error(erg.error || 'Netzwerkfehler');
        form.reset();
        abstellortAnpassen();
        herkunftAnpassen();
        meldung(form, 'Danke, eure Anmeldung ist angekommen! Ihr seid auf unserer Warteliste. ' +
          'Eine Bestätigung kommt gleich per E-Mail, und wir melden uns persönlich, sobald wir euch beliefern können.', 'success');
      })
      .catch(() => {
        meldung(form, 'Das Senden hat leider nicht funktioniert. Bitte ruft uns an (+43 664 2166181) ' +
          'oder schreibt an info@kruckenhaus.at.', 'error');
      })
      .finally(() => {
        if (knopf) {
          knopf.disabled = false;
          knopf.textContent = knopfText;
        }
      });
  });
}

// Meldung unter dem Formular (gleiches Aussehen wie das Kontaktformular)
function meldung(form, text, art) {
  form.querySelector('.form-message')?.remove();
  const el = document.createElement('div');
  el.className = `form-message form-message--${art}`;
  el.setAttribute('role', art === 'error' ? 'alert' : 'status');
  el.setAttribute('tabindex', '-1');
  el.textContent = text;
  form.appendChild(el);
  el.focus({ preventScroll: true });
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ------------------------------------------------------------
   2. AKTUELLES VOM STALL
   ------------------------------------------------------------ */
function initStallNeuigkeiten() {
  const ziel = document.getElementById('eier-neuigkeiten');
  if (!ziel) return;
  const datumText = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  fetch('/api/eier/neuigkeiten')
    .then((antwort) => antwort.json())
    .then((erg) => {
      const liste = (erg && erg.ok && erg.neuigkeiten) || [];
      if (!liste.length) return; // Hinweis „nichts Neues" bleibt stehen
      ziel.textContent = '';
      liste.forEach((n) => {
        const artikel = document.createElement('article');
        artikel.className = 'eier-neuigkeit';
        const zeit = document.createElement('time');
        zeit.dateTime = n.datum;
        zeit.textContent = datumText(n.datum);
        const titel = document.createElement('h3');
        titel.textContent = n.titel;
        artikel.append(zeit, titel);
        // Absätze aus Leerzeilen, sonst Text unverändert (kein HTML)
        String(n.text).split(/\n\s*\n/).forEach((absatz) => {
          const p = document.createElement('p');
          p.textContent = absatz.trim();
          artikel.appendChild(p);
        });
        ziel.appendChild(artikel);
      });
    })
    .catch(() => { /* ohne Verbindung bleibt der Hinweis stehen */ });
}

document.addEventListener('DOMContentLoaded', () => {
  initEierFormular();
  initStallNeuigkeiten();
});
