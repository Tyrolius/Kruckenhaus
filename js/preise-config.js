/**
 * ============================================================
 * KRUCKENHAUS – PREISKONFIGURATION
 * ============================================================
 *
 * Alle Preise und Buchungskonditionen zentral hier anpassen.
 * Diese Datei wird automatisch von preise.html geladen.
 *
 * ANLEITUNG:
 *   1. Öffnen Sie diese Datei in einem Texteditor
 *   2. Ändern Sie die gewünschten Werte
 *   3. Speichern – die Änderungen erscheinen sofort auf der Website
 *   4. Datei per Git committen und zu Netlify pushen
 *
 * ============================================================
 */

const PREISE = {

  // ----------------------------------------------------------
  // SAISONS – Zeiträume (nur zur Info, keine Funktion)
  // ----------------------------------------------------------
  saisons: {
    hauptsaison: {
      label:       'Hauptsaison',
      zeitraum:    'Juli – August | Weihnachten | Ostern | Silvester',
    },
    nebensaison: {
      label:       'Nebensaison',
      zeitraum:    'September – Juni (außer Feiertage)',
    },
  },

  // ----------------------------------------------------------
  // MIETPREISE PRO NACHT
  // ----------------------------------------------------------
  preisProNacht: {
    hauptsaison: 150,   // € pro Nacht (Hauptsaison)
    nebensaison: 120,   // € pro Nacht (Nebensaison)
  },

  // ----------------------------------------------------------
  // MINDESTAUFENTHALT (in Nächten)
  // ----------------------------------------------------------
  mindestaufenthalt: {
    hauptsaison: 7,     // Nächte
    nebensaison: 3,     // Nächte
  },

  // ----------------------------------------------------------
  // MAX. BELEGUNG
  // ----------------------------------------------------------
  belegung: {
    standard:        4,   // Personen (Standardpreis)
    max:             5,   // Personen (maximal)
    aufpreisPerson:  20,  // € pro zusätzliche Person/Nacht
  },

  // ----------------------------------------------------------
  // ZUSATZKOSTEN (einmalig pro Aufenthalt)
  // ----------------------------------------------------------
  zusatz: {
    endreinigung:        80,    // €
    haustier:            20,    // €
    kinderbett:          10,    // €
    hochstuhl:           0,     // € (kostenlos)
    spaeterCheckout:     30,    // €
  },

  // ----------------------------------------------------------
  // ORTSTAXE (Kurtaxe) – bei Gemeinde Breitenbach erfragen
  // ----------------------------------------------------------
  ortstaxe: {
    betrag:          2.80,   // € pro Person/Nacht
    ab_alter:        14,     // gilt ab diesem Alter
  },

  // ----------------------------------------------------------
  // ANZAHLUNG & RABATTE
  // ----------------------------------------------------------
  zahlung: {
    anzahlungProzent:  30,    // % Anzahlung bei Buchung
    barzahlungsrabatt: 3,     // % Rabatt bei vollständiger Barzahlung
  },

  // ----------------------------------------------------------
  // ZIMMERPREISE (Bergstein & Reintal) – pro Zimmer/Nacht
  // ----------------------------------------------------------
  zimmer: {
    preisProNacht: {
      hauptsaison: 75,    // € pro Zimmer/Nacht (Hauptsaison)
      nebensaison:  60,   // € pro Zimmer/Nacht (Nebensaison)
    },
    mindestaufenthalt: {
      hauptsaison: 3,     // Nächte
      nebensaison:  2,    // Nächte
    },
    endreinigung: 25,     // € pro Zimmer (einmalig)
    haustier:     15,     // € pro Zimmer/Aufenthalt
  },

  // ----------------------------------------------------------
  // STORNOBEDINGUNGEN (in Tagen vor Anreise)
  // ----------------------------------------------------------
  storno: {
    kostenlosBis:         30,   // Tage – volle Rückerstattung (abzgl. €15 Bearbeitung)
    teilrueckerstattung:  15,   // Tage – 50% Rückerstattung
    // < 14 Tage: keine Rückerstattung (Anzahlung verfällt)
    bearbeitungsgebuehr:  15,   // € bei kostenloser Stornierung
  },

};

// ----------------------------------------------------------
// PREISE IN HTML EINFÜGEN
// Läuft automatisch nach dem Laden der Seite.
// Nur ändern, wenn Sie das HTML-Layout anpassen.
// ----------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {

  const p = PREISE;
  const fmt = (zahl) => zahl.toLocaleString('de-AT', { minimumFractionDigits: 0 });
  const fmtEur = (zahl) => `€\u202f${fmt(zahl)}`;  // € + schmales Leerzeichen

  // Hauptsaison
  setze('[data-preis="hauptsaison-nacht"]',     fmtEur(p.preisProNacht.hauptsaison));
  setze('[data-preis="hauptsaison-zeitraum"]',  p.saisons.hauptsaison.zeitraum);
  setze('[data-preis="hauptsaison-mindest"]',   `${p.mindestaufenthalt.hauptsaison} Nächte`);

  // Nebensaison
  setze('[data-preis="nebensaison-nacht"]',     fmtEur(p.preisProNacht.nebensaison));
  setze('[data-preis="nebensaison-zeitraum"]',  p.saisons.nebensaison.zeitraum);
  setze('[data-preis="nebensaison-mindest"]',   `${p.mindestaufenthalt.nebensaison} Nächte`);

  // Gemeinsam (Belegung)
  setze('[data-preis="belegung-standard"]',     `${p.belegung.standard} Personen`);
  setze('[data-preis="belegung-max"]',          `${p.belegung.max} Personen`);
  setze('[data-preis="aufpreis-person"]',       fmtEur(p.belegung.aufpreisPerson));

  // Zusatzkosten
  setze('[data-preis="endreinigung"]',          fmtEur(p.zusatz.endreinigung));
  setze('[data-preis="haustier"]',              fmtEur(p.zusatz.haustier));
  setze('[data-preis="kinderbett"]',            fmtEur(p.zusatz.kinderbett));
  setze('[data-preis="spaeter-checkout"]',      fmtEur(p.zusatz.spaeterCheckout));

  // Ortstaxe
  setze('[data-preis="ortstaxe"]',
    `${p.ortstaxe.betrag.toFixed(2).replace('.', ',')} € / Person / Nacht`);

  // Zahlung & Rabatt
  setze('[data-preis="anzahlung-prozent"]',     `${p.zahlung.anzahlungProzent} %`);
  setze('[data-preis="barzahlungsrabatt"]',     `${p.zahlung.barzahlungsrabatt} %`);

  // Storno
  setze('[data-preis="storno-kostenlos"]',       `${p.storno.kostenlosBis} Tage`);
  setze('[data-preis="storno-teilrueckerstattung"]', `${p.storno.teilrueckerstattung}–${p.storno.kostenlosBis - 1} Tage`);
  setze('[data-preis="storno-bearbeitungsgebuehr"]', fmtEur(p.storno.bearbeitungsgebuehr));

  // Zimmer
  setze('[data-preis="zimmer-hauptsaison-nacht"]',  fmtEur(p.zimmer.preisProNacht.hauptsaison));
  setze('[data-preis="zimmer-nebensaison-nacht"]',   fmtEur(p.zimmer.preisProNacht.nebensaison));
  setze('[data-preis="zimmer-hauptsaison-mindest"]', `${p.zimmer.mindestaufenthalt.hauptsaison} Nächte`);
  setze('[data-preis="zimmer-nebensaison-mindest"]', `${p.zimmer.mindestaufenthalt.nebensaison} Nächte`);
  setze('[data-preis="zimmer-endreinigung"]',        fmtEur(p.zimmer.endreinigung));

  // Dynamisch: Rabatt-Badge im Zahlungsbereich
  const badge = document.querySelector('.rabatt-badge');
  if (badge) {
    badge.textContent =
      `${p.zahlung.barzahlungsrabatt} % Rabatt bei vollständiger Barzahlung bei Anreise!`;
  }
});

/**
 * Hilfsfunktion: Setzt den textContent aller passenden Elemente.
 * @param {string} selector - CSS-Selektor mit data-preis-Attribut
 * @param {string} wert     - Einzufügender Text
 */
function setze(selector, wert) {
  document.querySelectorAll(selector).forEach(el => {
    el.textContent = wert;
  });
}
