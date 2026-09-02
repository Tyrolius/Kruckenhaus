/**
 * ============================================================
 * KRUCKENHAUS – PREISKONFIGURATION
 * ============================================================
 *
 * Alle Preise und Buchungskonditionen zentral hier anpassen.
 * Diese Datei wird von preise.html und workation.html geladen und
 * füllt dort alle Elemente mit einem data-preis-Attribut.
 *
 * ANLEITUNG:
 *   1. Werte unten ändern (Zahlen ohne Euro-Zeichen).
 *   2. Speichern und committen – Cloudflare Pages veröffentlicht automatisch.
 *   3. Nach einer Preisänderung auch llms.txt und den makesOffer-Block
 *      in index.html nachziehen (dort stehen die Preise als Text).
 *
 * PREISMODELL (Stand September 2026):
 *   - Pauschalpreis pro Nacht für die ganze Wohnung, bis 4 Personen.
 *   - Vier Saisonstufen mit Datumsbereichen (siehe unten).
 *   - Endreinigung einmalig, separat ausgewiesen.
 *   - Aufenthaltsabgabe (Ortstaxe) pro Person und Nacht, ab 15 Jahren.
 *   - Langzeitrabatt ab 7 bzw. 14 Nächten auf den Nachtpreis.
 *
 * Die Saisonpreise sind ein Vorschlag aus dem Optimierungsplan
 * (docs/OPTIMIERUNGSPLAN.md, Abschnitt 3) und sollten mit den
 * Airbnb-Preisen abgeglichen werden: Der Website-Preis darf nie über
 * dem Airbnb-Preis liegen, sonst stimmt die Bestpreis-Zusage nicht.
 * ============================================================
 */

const PREISE = {

  // ----------------------------------------------------------
  // SAISONS – Reihenfolge = Reihenfolge auf der Preisseite.
  // "zeitraeume": Tag/Monat-Bereiche, die jedes Jahr gelten.
  // Bewegliche Feiertage (Ostern, Semesterferien) stehen als Text
  // im Feld "zeitraum" und müssen bei der Buchungsbestätigung
  // manuell zugeordnet werden.
  // ----------------------------------------------------------
  saisons: [
    {
      key:        'ruhig',
      label:      'Ruhige Saison',
      zeitraum:   'November bis Mitte Dezember · nach Ostern bis Mitte Mai',
      zeitraeume: [ ['11-01', '12-19'], ['04-20', '05-14'] ],
      preis:      125,   // € pro Nacht, ganze Wohnung
      mindest:    2,     // Nächte
    },
    {
      key:        'mittel',
      label:      'Zwischensaison',
      zeitraum:   'Mitte Mai bis Juni · September bis Oktober · Jänner (nach Dreikönig) bis März',
      zeitraeume: [ ['05-15', '06-30'], ['09-01', '10-31'], ['01-07', '03-31'] ],
      preis:      145,
      mindest:    3,
    },
    {
      key:        'hoch',
      label:      'Hauptsaison',
      zeitraum:   'Juli und August · Semesterferien · Ostern',
      zeitraeume: [ ['07-01', '08-31'] ],
      preis:      175,
      mindest:    5,
      featured:   true,  // wird auf der Preisseite hervorgehoben
    },
    {
      key:        'spitze',
      label:      'Weihnachten & Silvester',
      zeitraum:   '20. Dezember bis 6. Jänner',
      zeitraeume: [ ['12-20', '12-31'], ['01-01', '01-06'] ],
      preis:      210,
      mindest:    7,
    },
  ],

  // ----------------------------------------------------------
  // BELEGUNG – Pauschalpreis gilt für bis zu 4 Personen
  // (2 Schlafzimmer mit je einem Doppelbett). Muss mit der
  // Hausregel im Airbnb-Inserat übereinstimmen.
  // ----------------------------------------------------------
  belegung: {
    max: 4,
  },

  // ----------------------------------------------------------
  // ZUSATZKOSTEN (einmalig pro Aufenthalt)
  // ----------------------------------------------------------
  zusatz: {
    endreinigung:    80,    // € – verpflichtend, wird bei jedem "ab"-Preis mitgenannt
    haustier:        20,    // € – nur nach Absprache
    babybett:        0,     // € (kostenlos, steht in Schlafzimmer 1)
    hochstuhl:       0,     // € (kostenlos)
    spaeterCheckout: 30,    // € – bis 14:00 Uhr, nach Verfügbarkeit
  },

  // ----------------------------------------------------------
  // AUFENTHALTSABGABE (Tiroler Aufenthaltsabgabegesetz, "Ortstaxe").
  // Laut Familie Häusler aktuell 3,50 €. Hinweis: Die Abgabenübersicht
  // des Landes Tirol nennt für den TVB Alpbachtal & Tiroler Seenland
  // ab 1.5.2026 einen Satz von 4,00 € – beim TVB gegenprüfen.
  // ----------------------------------------------------------
  ortstaxe: {
    betrag:  3.50,   // € pro Person und Nacht
    abAlter: 15,     // gilt ab diesem Alter
  },

  // ----------------------------------------------------------
  // RABATTE
  // ----------------------------------------------------------
  rabatte: {
    // Langzeitrabatt auf den Nachtpreis (nicht auf Endreinigung/Abgabe).
    langzeit: [
      { abNaechte: 7,  prozent: 7  },
      { abNaechte: 14, prozent: 12 },
    ],
    // Direktbucher-Vorteil: Bestpreis (nie teurer als auf Portalen)
    // und ein Begrüßungskorb aus dem Hofladen. Reiner Text, siehe preise.html.
  },

  // ----------------------------------------------------------
  // ZAHLUNG
  // ----------------------------------------------------------
  zahlung: {
    anzahlungProzent: 30,   // % bei Buchung, fällig innerhalb von 7 Tagen
    restzahlungTage:  14,   // Tage vor Anreise (bei Überweisung)
  },

  // ----------------------------------------------------------
  // STORNOBEDINGUNGEN (Tage vor Anreise)
  //   ab kostenlosBis Tagen:          Anzahlung abzüglich Bearbeitungsgebühr zurück
  //   teilrueckerstattungBis..kostenlosBis-1: 50 % der Anzahlung zurück
  //   darunter:                        Anzahlung verfällt
  // ----------------------------------------------------------
  storno: {
    kostenlosBis:            30,
    teilrueckerstattungBis:  14,
    bearbeitungsgebuehr:     15,   // €
  },

};

// ============================================================
// AB HIER NICHTS ÄNDERN – füllt die Seite automatisch.
// ============================================================
(function () {
  'use strict';

  const fmtEur = (zahl) => '€ ' + zahl.toLocaleString('de-AT', { minimumFractionDigits: 0 });
  const fmtPct = (zahl) => zahl + ' %';

  /** Setzt textContent aller Elemente mit passendem data-preis-Wert. */
  function setze(key, wert) {
    document.querySelectorAll('[data-preis="' + key + '"]').forEach((el) => { el.textContent = wert; });
  }

  /** Gesamtpreis-Beispiel: Nächte × Nachtpreis (abzgl. Langzeitrabatt) + Endreinigung + Abgabe. */
  function gesamt(saison, naechte, personen) {
    let rabatt = 0;
    PREISE.rabatte.langzeit.forEach((r) => { if (naechte >= r.abNaechte) rabatt = r.prozent; });
    const naechtePreis = Math.round(saison.preis * naechte * (1 - rabatt / 100));
    const abgabe = PREISE.ortstaxe.betrag * personen * naechte;
    return {
      naechtePreis,
      rabatt,
      abgabe,
      summe: naechtePreis + PREISE.zusatz.endreinigung + abgabe,
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const p = PREISE;

    // Saisonkarten
    p.saisons.forEach((s) => {
      setze('saison-' + s.key + '-preis',    fmtEur(s.preis));
      setze('saison-' + s.key + '-zeitraum', s.zeitraum);
      setze('saison-' + s.key + '-mindest',  s.mindest + ' Nächte');
    });
    const guenstigste = Math.min(...p.saisons.map((s) => s.preis));
    setze('ab-preis', fmtEur(guenstigste));
    setze('belegung-max', p.belegung.max + ' Personen');

    // Zusatzkosten
    setze('endreinigung',     fmtEur(p.zusatz.endreinigung));
    setze('haustier',         fmtEur(p.zusatz.haustier));
    setze('spaeter-checkout', fmtEur(p.zusatz.spaeterCheckout));
    setze('ortstaxe', p.ortstaxe.betrag.toFixed(2).replace('.', ',') + ' € / Person / Nacht');
    setze('ortstaxe-ab-alter', 'ab ' + p.ortstaxe.abAlter + ' Jahren');

    // Rabatte
    p.rabatte.langzeit.forEach((r) => { setze('langzeit-' + r.abNaechte, fmtPct(r.prozent)); });
    setze('langzeit-max', 'bis ' + fmtPct(Math.max(...p.rabatte.langzeit.map((r) => r.prozent))));

    // Zahlung
    setze('anzahlung-prozent',  fmtPct(p.zahlung.anzahlungProzent));
    setze('restzahlung-prozent', fmtPct(100 - p.zahlung.anzahlungProzent));
    setze('restzahlung-tage',   p.zahlung.restzahlungTage + ' Tage');

    // Storno
    setze('storno-kostenlos', p.storno.kostenlosBis + ' Tage');
    setze('storno-teil', p.storno.teilrueckerstattungBis + '–' + (p.storno.kostenlosBis - 1) + ' Tage');
    setze('storno-verfall', p.storno.teilrueckerstattungBis + ' Tagen');
    setze('storno-bearbeitungsgebuehr', fmtEur(p.storno.bearbeitungsgebuehr));

    // Gesamtpreis-Beispiele (preise.html): data-beispiel="saisonKey:naechte:personen"
    document.querySelectorAll('[data-beispiel]').forEach((el) => {
      const [key, n, pers] = el.dataset.beispiel.split(':');
      const saison = p.saisons.find((s) => s.key === key);
      if (!saison) return;
      const g = gesamt(saison, Number(n), Number(pers));
      const q = (sel) => el.querySelector(sel);
      if (q('.bsp-titel')) q('.bsp-titel').textContent =
        pers + ' Personen · ' + n + ' Nächte · ' + saison.label;
      if (q('.bsp-naechte')) q('.bsp-naechte').textContent =
        n + ' × ' + fmtEur(saison.preis) + (g.rabatt ? ' (−' + g.rabatt + ' % Langzeitrabatt)' : '');
      if (q('.bsp-naechte-summe')) q('.bsp-naechte-summe').textContent = fmtEur(g.naechtePreis);
      if (q('.bsp-reinigung')) q('.bsp-reinigung').textContent = fmtEur(p.zusatz.endreinigung);
      if (q('.bsp-abgabe')) q('.bsp-abgabe').textContent =
        pers + ' × ' + n + ' × ' + p.ortstaxe.betrag.toFixed(2).replace('.', ',') + ' €';
      if (q('.bsp-abgabe-summe')) q('.bsp-abgabe-summe').textContent = fmtEur(g.abgabe);
      if (q('.bsp-summe')) q('.bsp-summe').textContent = fmtEur(g.summe);
      if (q('.bsp-pro-nacht')) q('.bsp-pro-nacht').textContent =
        'entspricht ' + fmtEur(Math.round(g.summe / Number(n))) + ' pro Nacht, alles inklusive';
    });
  });

  // Für spätere Erweiterungen (Preisrechner im Kalender) nach außen reichen.
  window.KRUCKENHAUS_PREISE = { config: PREISE, gesamt };
})();
