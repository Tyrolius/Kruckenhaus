/* ============================================================
 * CLOUDFLARE PAGES FUNCTION – Schnittstelle der Hofladen-Verwaltung
 * ============================================================
 * Erreichbar unter /api/verwaltung/… – nur nach erfolgreicher
 * Zugangsprüfung (_middleware.js im selben Ordner).
 *
 *   GET  /api/verwaltung/stand                    alles, was die Oberfläche braucht
 *   GET  /api/verwaltung/auswertung?jahr=2026     Jahresauswertung (auch abgeschlossene Runden)
 *   POST /api/verwaltung/bestellung               Bestellung erfassen
 *   POST /api/verwaltung/bestellung/<id>          Bestellung ändern ({ aktion, … }):
 *        uebergeben, bezahlt, zahlart, termin, kontakt, notiz, stornieren,
 *        nachruecken, gewicht, position (Menge ändern/Artikel dazu),
 *        abschliessen (Gewichte + übergeben + ggf. bar kassiert in einem)
 *   POST /api/verwaltung/hofverkauf               Verkauf am Hof ohne Vorbestellung
 *   POST /api/verwaltung/gesehen                  Website-Bestellungen als gesehen markieren
 *   POST /api/verwaltung/tour                     Reihenfolge der Liefertour speichern
 *   POST /api/verwaltung/produkt                  Produkt anlegen (Sortiment)
 *   POST /api/verwaltung/produkt/<id>             Produkt bearbeiten / aus- und einblenden
 *   POST /api/verwaltung/charge                   Bestellrunde anlegen
 *   POST /api/verwaltung/charge/<id>              Bestellrunde bearbeiten
 *   POST /api/verwaltung/charge/<id>/status       nur den Status ändern (abschließen, wieder öffnen)
 *   POST /api/verwaltung/voranmeldung             Voranmeldung erfassen
 *   POST /api/verwaltung/voranmeldung/<id>/absagen
 *   POST /api/verwaltung/voranmeldungen/uebernehmen
 *   POST /api/verwaltung/widerruf/<id>/erledigt   Widerruf als erledigt markieren
 *
 * POST nur mit Content-Type application/json – fremde Seiten können so
 * keine Änderungen im Namen eines angemeldeten Nutzers auslösen.
 * IDs gehen als Text an die Oberfläche und werden hier wieder geprüft.
 *
 * Binding: DB (D1 „kruckenhaus", Tabellen aus schema-hofladen.sql)
 * Optional (Secrets, für den Packzettel bei Überweisung):
 *   BANK_INHABER, BANK_IBAN, BANK_BIC, BANK_NAME – fehlen sie, druckt der
 *   Packzettel keinen Überweisungsblock.
 * ============================================================ */

import {
  json, EingabeFehler, ZEITRAEUME, istGueltigeEmail,
  bestellungAnlegen, bestellungNachruecken, preisVorschlaege,
  voranmeldungAnlegen, voranmeldungenUebernehmen, bankAusEnv, SQL_ALS_GESEHEN,
} from '../../_lib/hofladen.js';

/* ------------------------------------------------------------
   1. EINGABEN PRÜFEN
   ------------------------------------------------------------ */
const QUELLEN = ['web', 'whatsapp', 'telefon', 'persoenlich'];
const ZAHLARTEN = ['bar', 'ueberweisung'];
const CHARGE_STATUS = ['entwurf', 'stammkunden', 'offen', 'geschlossen', 'archiviert'];
const PRODUKT_ARTEN = ['gewicht', 'paket', 'stueck'];
const KATEGORIEN = ['fleisch', 'nudeln', 'honig', 'seife', 'saison'];
// Sammelkunde für Verkäufe am Hof, bei denen kein Name angegeben wird
const SAMMELKUNDE = 'Verkauf am Hof (ohne Namen)';

function nummer(wert, name = 'Nummer') {
  const n = Number(wert);
  if (!Number.isInteger(n) || n <= 0) throw new EingabeFehler(`Ungültige ${name}.`);
  return n;
}

function ganzzahl(wert, name, { min = 0, max = 1e9, leer = false } = {}) {
  if (leer && (wert === null || wert === undefined || wert === '')) return null;
  const n = Number(wert);
  if (!Number.isInteger(n) || n < min || n > max) throw new EingabeFehler(`Ungültiger Wert: ${name}.`);
  return n;
}

const text = (wert, max = 500) => String(wert ?? '').trim().slice(0, max);
const textOderNull = (wert, max) => text(wert, max) || null;

function auswahl(wert, erlaubt, name) {
  if (!erlaubt.includes(wert)) throw new EingabeFehler(`Ungültige Auswahl: ${name}.`);
  return wert;
}

function datum(wert, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(wert || ''))) throw new EingabeFehler(`Ungültiges Datum: ${name}.`);
  return wert;
}

function uhrzeit(wert) {
  if (!wert) return null;
  if (!/^\d{2}:\d{2}$/.test(String(wert))) throw new EingabeFehler('Ungültige Uhrzeit.');
  return wert;
}

const id = (wert) => (wert == null ? null : String(wert));

/* ------------------------------------------------------------
   2. STAND LADEN (für die Oberfläche)
   Gleiche Form wie verwaltung/entwurf-daten.js.
   ------------------------------------------------------------ */

async function standLaden(db, bank = null) {
  const aktiv = `SELECT id FROM chargen WHERE status <> 'archiviert'`;
  const [chargen, artikel, termine, bestellungen, positionen, kunden, produkte, voranmeldungen, liefergebiet, widerrufe] =
    (await db.batch([
      db.prepare(`SELECT id, titel, status, bestellschluss FROM chargen
                  WHERE status <> 'archiviert' ORDER BY bestellschluss, id`),
      db.prepare(`SELECT ca.id, ca.charge_id, ca.produkt_id, ca.preis_cent, ca.kontingent, ca.max_pro_bestellung,
                         p.name, p.art, p.richtgewicht_von_g, p.richtgewicht_bis_g
                  FROM charge_artikel ca JOIN produkte p ON p.id = ca.produkt_id
                  WHERE ca.charge_id IN (${aktiv})
                  ORDER BY p.kategorie, ca.reihenfolge, p.reihenfolge, p.name`),
      db.prepare(`SELECT id, charge_id, art, datum, von, bis, hinweis FROM termine
                  WHERE charge_id IN (${aktiv}) ORDER BY datum, von`),
      db.prepare(`SELECT id, nummer, charge_id, kunde_id, quelle, status, termin_id, lieferadresse, zahlart,
                         uebergeben_am, bezahlt_art, anmerkung, interne_notiz, erstellt_am,
                         EXISTS (SELECT 1 FROM bestellung_gesehen g WHERE g.bestellung_id = bestellungen.id) AS gesehen
                  FROM bestellungen WHERE charge_id IN (${aktiv}) ORDER BY id`),
      db.prepare(`SELECT p.id, p.bestellung_id, p.charge_artikel_id, p.menge, p.einzelpreis_cent, p.gewicht_g
                  FROM bestell_positionen p JOIN bestellungen b ON b.id = p.bestellung_id
                  WHERE b.charge_id IN (${aktiv}) ORDER BY p.id`),
      db.prepare(`SELECT k.id, k.name, k.telefon, k.email, k.strasse, k.plz, k.ort, k.stammkunde, k.notiz,
                         t.rang AS tour_rang
                  FROM kunden k LEFT JOIN tour_reihenfolge t ON t.kunde_id = k.id ORDER BY k.name`),
      db.prepare(`SELECT id, name, art, kategorie, richtgewicht_von_g, richtgewicht_bis_g, startpreis_cent,
                         aktiv, beschreibung, pflichtangaben, allergene,
                         EXISTS (SELECT 1 FROM charge_artikel ca WHERE ca.produkt_id = produkte.id) AS verwendet
                  FROM produkte ORDER BY kategorie, reihenfolge, name`),
      db.prepare(`SELECT id, kunde_id, produkt_id, menge, zeitraum, jahr, quelle, status, notiz, erstellt_am
                  FROM voranmeldungen WHERE status = 'offen' ORDER BY erstellt_am, id`),
      db.prepare(`SELECT plz, ort, liefergebuehr_cent, gratis_ab_cent FROM liefergebiet ORDER BY tour_reihenfolge, ort`),
      db.prepare(`SELECT id, bestellung_id, bestellnummer, name, email, umfang, quelle, eingegangen_am
                  FROM widerrufe WHERE status = 'offen' ORDER BY eingegangen_am, id`),
    ])).map((r) => r.results);

  const jePos = new Map();
  for (const p of positionen) {
    if (!jePos.has(p.bestellung_id)) jePos.set(p.bestellung_id, []);
    jePos.get(p.bestellung_id).push({
      id: id(p.id), artikelId: id(p.charge_artikel_id), menge: p.menge,
      einzelpreisCent: p.einzelpreis_cent, gewichtG: p.gewicht_g ?? undefined,
    });
  }

  return {
    chargen: chargen.map((c) => ({
      id: id(c.id), titel: c.titel, status: c.status, bestellschluss: c.bestellschluss,
      termine: termine.filter((t) => t.charge_id === c.id).map((t) => ({
        id: id(t.id), art: t.art, datum: t.datum, von: t.von || '', bis: t.bis || '', hinweis: t.hinweis || '',
      })),
      artikel: artikel.filter((a) => a.charge_id === c.id).map((a) => ({
        id: id(a.id), produktId: id(a.produkt_id), name: a.name, art: a.art, preisCent: a.preis_cent,
        kontingent: a.kontingent, maxProBestellung: a.max_pro_bestellung,
        richtVonG: a.richtgewicht_von_g, richtBisG: a.richtgewicht_bis_g,
      })),
    })),
    kunden: kunden.map((k) => ({
      id: id(k.id), name: k.name, telefon: k.telefon || '', email: k.email || '', strasse: k.strasse || '',
      plz: k.plz || '', ort: k.ort || '', stammkunde: Boolean(k.stammkunde), notiz: k.notiz || '',
      tourRang: k.tour_rang ?? null,
    })),
    bestellungen: bestellungen.map((b) => ({
      id: id(b.id), nummer: b.nummer, chargeId: id(b.charge_id), kundeId: id(b.kunde_id), quelle: b.quelle,
      erstellt: String(b.erstellt_am).slice(0, 10), status: b.status, terminId: id(b.termin_id),
      lieferadresse: b.lieferadresse || '', zahlart: b.zahlart, bezahlt: b.bezahlt_art || null,
      uebergeben: Boolean(b.uebergeben_am), anmerkung: b.anmerkung || '', interneNotiz: b.interne_notiz || '',
      neu: b.quelle === 'web' && !b.gesehen,
      positionen: jePos.get(b.id) || [],
    })),
    produkte: produkte.map((p) => ({
      id: id(p.id), name: p.name, art: p.art, kategorie: p.kategorie, aktiv: Boolean(p.aktiv),
      richtVonG: p.richtgewicht_von_g, richtBisG: p.richtgewicht_bis_g, startpreisCent: p.startpreis_cent,
      beschreibung: p.beschreibung || '', pflichtangaben: p.pflichtangaben || '', allergene: p.allergene || '',
      verwendet: Boolean(p.verwendet),
    })),
    voranmeldungen: voranmeldungen.map((v) => ({
      id: id(v.id), kundeId: id(v.kunde_id), produktId: id(v.produkt_id), menge: v.menge,
      zeitraum: v.zeitraum, jahr: v.jahr, quelle: v.quelle, status: v.status, notiz: v.notiz || '',
      erstellt: String(v.erstellt_am).slice(0, 10),
    })),
    liefergebiet: liefergebiet.map((l) => ({
      plz: l.plz, ort: l.ort, liefergebuehrCent: l.liefergebuehr_cent, gratisAbCent: l.gratis_ab_cent,
    })),
    tourReihenfolge: liefergebiet.map((l) => l.ort),
    widerrufe: widerrufe.map((w) => ({
      id: id(w.id), bestellungId: id(w.bestellung_id), nummer: w.bestellnummer, name: w.name, email: w.email,
      umfang: w.umfang, quelle: w.quelle, eingegangen: w.eingegangen_am,
    })),
    bank,
    preisVorschlaege: (await preisVorschlaege(db)).map((v) => ({
      produktId: id(v.produktId), preisCent: v.preisCent, kontingent: v.kontingent,
      maxProBestellung: v.maxProBestellung, ausCharge: v.ausCharge || '',
    })),
  };
}

/* ------------------------------------------------------------
   3. KUNDEN
   Bestehender Kunde (kundeId): Kontaktdaten nur ergänzen/aktualisieren,
   wenn etwas eingetragen wurde. Sonst neuen Kunden anlegen.
   ------------------------------------------------------------ */
async function kundeSichern(db, kundeId, kunde = {}) {
  const email = text(kunde.email, 160).toLowerCase() || null;
  if (email && !istGueltigeEmail(email)) throw new EingabeFehler('Bitte eine gültige E-Mail-Adresse eintragen.');
  const felder = {
    email,
    telefon: textOderNull(kunde.telefon, 40),
    strasse: textOderNull(kunde.strasse, 120),
    plz: textOderNull(kunde.plz, 10),
    ort: textOderNull(kunde.ort, 80),
  };
  if (kundeId) {
    const kid = nummer(kundeId, 'Kundennummer');
    const r = await db.prepare(
      `UPDATE kunden SET email = COALESCE(?, email), telefon = COALESCE(?, telefon),
              strasse = COALESCE(?, strasse), plz = COALESCE(?, plz), ort = COALESCE(?, ort)
       WHERE id = ?`
    ).bind(felder.email, felder.telefon, felder.strasse, felder.plz, felder.ort, kid).run();
    if (!r.meta.changes) throw new EingabeFehler('Kunde nicht gefunden.');
    return kid;
  }
  const name = text(kunde.name, 120);
  if (!name) throw new EingabeFehler('Bitte einen Namen eintragen.');
  const zeile = await db.prepare(
    'INSERT INTO kunden (name, email, telefon, strasse, plz, ort) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
  ).bind(name, felder.email, felder.telefon, felder.strasse, felder.plz, felder.ort).first();
  return zeile.id;
}

/* ------------------------------------------------------------
   4. BESTELLUNGEN
   ------------------------------------------------------------ */
async function bestellungErfassen(db, e) {
  const chargeId = nummer(e.chargeId, 'Bestellrunde');
  const terminId = e.terminId ? nummer(e.terminId, 'Termin') : null;
  let lieferadresse = null;
  if (terminId) {
    const termin = await db.prepare('SELECT art FROM termine WHERE id = ? AND charge_id = ?').bind(terminId, chargeId).first();
    if (!termin) throw new EingabeFehler('Termin gehört nicht zu dieser Bestellrunde.');
    if (termin.art === 'lieferung') {
      const k = e.kunde || {};
      if (!text(k.strasse) || !text(k.ort)) throw new EingabeFehler('Für die Lieferung bitte Adresse eintragen.');
      lieferadresse = `${text(k.strasse, 120)}, ${`${text(k.plz, 10)} ${text(k.ort, 80)}`.trim()}`;
    }
  }
  const kundeId = await kundeSichern(db, e.kundeId, e.kunde);
  return bestellungAnlegen(db, {
    chargeId,
    kundeId,
    terminId,
    quelle: auswahl(e.quelle || 'telefon', QUELLEN, 'Quelle'),
    zahlart: auswahl(e.zahlart || 'bar', ZAHLARTEN, 'Zahlart'),
    lieferadresse,
    anmerkung: textOderNull(e.anmerkung, 1000),
    positionen: (e.positionen || []).map((p) => ({
      chargeArtikelId: nummer(p.artikelId, 'Artikelnummer'),
      menge: ganzzahl(p.menge, 'Menge', { min: 0, max: 999 }),
    })),
  }, {
    hoechstmengeIgnorieren: true,
    // Selbst erfasst – gilt nicht als „neu"
    zusatz: (nr) => [db.prepare(SQL_ALS_GESEHEN).bind(nr)],
  });
}

// Gewicht einer Position nur bei Gewichtsware setzen (sonst ändert sich nichts)
function gewichtSetzen(db, bid, positionId, gewichtG) {
  return db.prepare(
    `UPDATE bestell_positionen SET gewicht_g = ?
     WHERE id = ? AND bestellung_id = ? AND charge_artikel_id IN (
       SELECT ca.id FROM charge_artikel ca JOIN produkte p ON p.id = ca.produkt_id WHERE p.art = 'gewicht')`
  ).bind(gewichtG, positionId, bid);
}

// Bar kassiert: Zeitpunkt, Art und den Betrag zu diesem Zeitpunkt festhalten
const SQL_BAR_KASSIERT =
  `bezahlt_am = datetime('now'), bezahlt_art = 'bar', zahlart = 'bar',
   bezahlt_betrag_cent = (SELECT gesamt_cent FROM v_bestellsummen WHERE bestellung_id = bestellungen.id)`;

/**
 * Übergabe in einem Schritt: Gewichte vom Etikett speichern, als übergeben
 * markieren und – bei Barzahlung – gleich als bezahlt. Gewichtsware ohne
 * Gewicht wird abgelehnt, damit nie ein geschätzter Betrag kassiert wird.
 */
async function bestellungAbschliessen(db, bid, e) {
  const zahlung = e.zahlung == null ? null : auswahl(e.zahlung, ZAHLARTEN, 'Zahlung');
  const gewichte = new Map((e.gewichte || []).map((g) => [
    nummer(g.positionId, 'Position'),
    ganzzahl(g.gewichtG, 'Gewicht', { min: 1, max: 200000 }),
  ]));
  const b = await db.prepare('SELECT status FROM bestellungen WHERE id = ?').bind(bid).first();
  if (!b) throw new EingabeFehler('Bestellung nicht gefunden.');
  if (b.status !== 'vorgemerkt') throw new EingabeFehler('Nur vorgemerkte Bestellungen können übergeben werden.');
  const { results: positionen } = await db.prepare(
    `SELECT bp.id, bp.gewicht_g, p.art FROM bestell_positionen bp
     JOIN charge_artikel ca ON ca.id = bp.charge_artikel_id JOIN produkte p ON p.id = ca.produkt_id
     WHERE bp.bestellung_id = ?`
  ).bind(bid).all();
  for (const pid of gewichte.keys()) {
    if (!positionen.some((p) => p.id === pid && p.art === 'gewicht')) throw new EingabeFehler('Position nicht gefunden oder keine Gewichtsware.');
  }
  if (positionen.some((p) => p.art === 'gewicht' && !gewichte.has(p.id) && !p.gewicht_g)) {
    throw new EingabeFehler('Bitte alle Gewichte eintragen.');
  }
  await db.batch([
    ...[...gewichte].map(([pid, g]) => gewichtSetzen(db, bid, pid, g)),
    db.prepare(`UPDATE bestellungen SET uebergeben_am = datetime('now'), geaendert_am = datetime('now')
                ${zahlung === 'ueberweisung' ? ", zahlart = 'ueberweisung'" : ''} WHERE id = ?`).bind(bid),
    ...(zahlung === 'bar'
      ? [db.prepare(`UPDATE bestellungen SET ${SQL_BAR_KASSIERT} WHERE id = ? AND bezahlt_am IS NULL`).bind(bid)]
      : []),
    db.prepare('INSERT OR IGNORE INTO bestellung_gesehen (bestellung_id) VALUES (?)').bind(bid),
  ]);
  return {};
}

/**
 * Menge eines Artikels in einer Bestellung setzen (z. B. bei der Übergabe
 * „ein Huhn mehr"). Mehr geht nur, solange genug frei ist – geprüft in
 * derselben Anweisung, damit nichts doppelt verkauft wird. Bei Gewichtsware
 * wird das Gewicht zurückgesetzt, weil es nicht mehr zur Stückzahl passt.
 */
async function positionSetzen(db, bid, e) {
  const artikelId = nummer(e.artikelId, 'Artikel');
  const menge = ganzzahl(e.menge, 'Menge', { min: 0, max: 999 });
  const b = await db.prepare(
    `SELECT b.status, ca.id AS artikel FROM bestellungen b
     LEFT JOIN charge_artikel ca ON ca.charge_id = b.charge_id AND ca.id = ?
     WHERE b.id = ?`
  ).bind(artikelId, bid).first();
  if (!b) throw new EingabeFehler('Bestellung nicht gefunden.');
  if (!b.artikel) throw new EingabeFehler('Artikel gehört nicht zu dieser Bestellrunde.');
  if (b.status !== 'vorgemerkt') throw new EingabeFehler('Nur bei vorgemerkten Bestellungen möglich.');
  const { results: positionen } = await db.prepare(
    'SELECT id, charge_artikel_id, menge FROM bestell_positionen WHERE bestellung_id = ?'
  ).bind(bid).all();
  const pos = positionen.find((p) => p.charge_artikel_id === artikelId);
  const frei = async () => (await db.prepare('SELECT frei FROM v_bestand WHERE charge_artikel_id = ?').bind(artikelId).first()).frei;

  let r;
  if (menge === 0) {
    if (!pos) return {};
    if (positionen.length === 1) throw new EingabeFehler('Der letzte Artikel kann nicht entfernt werden – Bestellung stattdessen stornieren.');
    r = await db.prepare('DELETE FROM bestell_positionen WHERE id = ?').bind(pos.id).run();
  } else if (pos) {
    r = await db.prepare(
      `UPDATE bestell_positionen SET menge = ?1, gewicht_g = CASE WHEN menge = ?1 THEN gewicht_g END
       WHERE id = ?2 AND ?1 - menge <= (SELECT frei FROM v_bestand WHERE charge_artikel_id = ?3)`
    ).bind(menge, pos.id, artikelId).run();
    if (!r.meta.changes) throw new EingabeFehler(`Nicht genug frei – noch ${Math.max(0, await frei())} verfügbar.`);
  } else {
    r = await db.prepare(
      `INSERT INTO bestell_positionen (bestellung_id, charge_artikel_id, menge, einzelpreis_cent)
       SELECT ?1, ca.id, ?2, ca.preis_cent FROM charge_artikel ca
       WHERE ca.id = ?3 AND ?2 <= (SELECT frei FROM v_bestand WHERE charge_artikel_id = ?3)`
    ).bind(bid, menge, artikelId).run();
    if (!r.meta.changes) throw new EingabeFehler(`Nicht genug frei – noch ${Math.max(0, await frei())} verfügbar.`);
  }
  await db.prepare(`UPDATE bestellungen SET geaendert_am = datetime('now') WHERE id = ?`).bind(bid).run();
  return {};
}

/* ------------------------------------------------------------
   4a. VERKAUF AM HOF (ohne Vorbestellung)
   Wird wie eine Bestellung angelegt, aber gleich übergeben (und bei
   Barzahlung bezahlt). Zählt von der Menge ab; reicht sie nicht, wird
   nichts gespeichert.
   ------------------------------------------------------------ */
async function hofverkauf(db, e) {
  const chargeId = nummer(e.chargeId, 'Bestellrunde');
  const zahlung = auswahl(e.zahlung || 'bar', ZAHLARTEN, 'Zahlung');
  const positionen = (e.positionen || [])
    .map((p) => ({
      chargeArtikelId: nummer(p.artikelId, 'Artikelnummer'),
      menge: ganzzahl(p.menge, 'Menge', { min: 0, max: 999 }),
      gewichtG: ganzzahl(p.gewichtG, 'Gewicht', { min: 1, max: 200000, leer: true }),
    }))
    .filter((p) => p.menge > 0);
  if (!positionen.length) throw new EingabeFehler('Bitte mindestens einen Artikel wählen.');
  if (new Set(positionen.map((p) => p.chargeArtikelId)).size !== positionen.length) {
    throw new EingabeFehler('Ein Artikel ist doppelt angegeben.');
  }

  const { results: artikel } = await db.prepare(
    `SELECT ca.id, p.art, v.frei FROM charge_artikel ca JOIN produkte p ON p.id = ca.produkt_id
     JOIN v_bestand v ON v.charge_artikel_id = ca.id WHERE ca.charge_id = ?`
  ).bind(chargeId).all();
  for (const p of positionen) {
    const a = artikel.find((x) => x.id === p.chargeArtikelId);
    if (!a) throw new EingabeFehler('Artikel gehört nicht zu dieser Bestellrunde.');
    if (a.art === 'gewicht' && !p.gewichtG) throw new EingabeFehler('Bitte alle Gewichte eintragen.');
    if (a.art !== 'gewicht') p.gewichtG = null;
    if (p.menge > a.frei) throw new EingabeFehler(`Nicht genug frei – noch ${Math.max(0, a.frei)} verfügbar.`);
  }

  // Kunde: bekannt, neu mit Name oder – ohne Namen – der Sammelkunde
  let kundeId;
  if (e.kundeId || text(e.kunde && e.kunde.name)) {
    kundeId = await kundeSichern(db, e.kundeId, e.kunde);
  } else {
    const sammel = await db.prepare('SELECT id FROM kunden WHERE name = ? ORDER BY id LIMIT 1').bind(SAMMELKUNDE).first();
    kundeId = sammel ? sammel.id : await kundeSichern(db, null, { name: SAMMELKUNDE });
  }

  const erg = await bestellungAnlegen(db, {
    chargeId,
    kundeId,
    quelle: 'persoenlich',
    zahlart: zahlung,
    interneNotiz: 'Verkauf am Hof',
    positionen,
  }, {
    hoechstmengeIgnorieren: true,
    zusatz: (nr) => [
      ...positionen.filter((p) => p.gewichtG).map((p) => db.prepare(
        `UPDATE bestell_positionen SET gewicht_g = ?
         WHERE bestellung_id = (SELECT id FROM bestellungen WHERE nummer = ?) AND charge_artikel_id = ?`
      ).bind(p.gewichtG, nr, p.chargeArtikelId)),
      db.prepare(`UPDATE bestellungen SET uebergeben_am = datetime('now') WHERE nummer = ?`).bind(nr),
      ...(zahlung === 'bar' ? [db.prepare(`UPDATE bestellungen SET ${SQL_BAR_KASSIERT} WHERE nummer = ?`).bind(nr)] : []),
      db.prepare(SQL_ALS_GESEHEN).bind(nr),
    ],
  });

  // Gleichzeitig hat jemand anderer zugegriffen – dann nichts speichern
  if (erg.status !== 'vorgemerkt') {
    await db.batch([
      db.prepare('DELETE FROM bestellung_gesehen WHERE bestellung_id = ?').bind(erg.id),
      db.prepare('DELETE FROM bestell_positionen WHERE bestellung_id = ?').bind(erg.id),
      db.prepare('DELETE FROM bestellungen WHERE id = ?').bind(erg.id),
    ]);
    throw new EingabeFehler('Nicht genug frei – inzwischen anderweitig bestellt.');
  }
  return { bestellung: { id: id(erg.id), nummer: erg.nummer } };
}

/* ------------------------------------------------------------
   4b. NEU-MARKIERUNG UND LIEFERTOUR
   ------------------------------------------------------------ */
async function alsGesehen(db, e) {
  const ids = [...new Set((e.ids || []).map((x) => nummer(x, 'Bestellnummer')))].slice(0, 500);
  if (!ids.length) return {};
  await db.batch(ids.map((bid) => db.prepare(
    'INSERT OR IGNORE INTO bestellung_gesehen (bestellung_id) SELECT id FROM bestellungen WHERE id = ?'
  ).bind(bid)));
  return {};
}

// Reihenfolge der Kunden innerhalb eines Orts: Rang 10, 20, 30 …
async function tourSpeichern(db, e) {
  const ids = [...new Set((e.kundeIds || []).map((x) => nummer(x, 'Kundennummer')))].slice(0, 300);
  if (!ids.length) return {};
  await db.batch(ids.map((kid, i) => db.prepare(
    `INSERT INTO tour_reihenfolge (kunde_id, rang) SELECT id, ? FROM kunden WHERE id = ?
     ON CONFLICT (kunde_id) DO UPDATE SET rang = excluded.rang`
  ).bind((i + 1) * 10, kid)));
  return {};
}

/* ------------------------------------------------------------
   4c. SORTIMENT (Produkte anlegen und bearbeiten)
   Produkte werden nie gelöscht, sondern ausgeblendet (aktiv = 0) – alte
   Bestellungen verweisen weiter auf sie. Die Art (Gewicht/Fixpreis) lässt
   sich nur ändern, solange das Produkt noch in keiner Bestellrunde war.
   ------------------------------------------------------------ */
function produktPruefen(e) {
  const name = text(e.name, 120);
  if (!name) throw new EingabeFehler('Bitte einen Namen eintragen.');
  const art = auswahl(e.art, PRODUKT_ARTEN, 'Art');
  const p = {
    name,
    art,
    kategorie: auswahl(e.kategorie || 'saison', KATEGORIEN, 'Bereich'),
    startpreisCent: ganzzahl(e.startpreisCent, 'Preis', { max: 10000000, leer: true }),
    beschreibung: textOderNull(e.beschreibung, 1000),
    pflichtangaben: textOderNull(e.pflichtangaben, 1000),
    allergene: textOderNull(e.allergene, 300),
    aktiv: e.aktiv === false ? 0 : 1,
    richtVonG: null,
    richtBisG: null,
  };
  if (art === 'gewicht') {
    p.richtVonG = ganzzahl(e.richtVonG, 'Gewicht von', { min: 1, max: 200000 });
    p.richtBisG = ganzzahl(e.richtBisG, 'Gewicht bis', { min: 1, max: 200000 });
    if (p.richtBisG < p.richtVonG) throw new EingabeFehler('„Gewicht bis" muss mindestens so groß sein wie „von".');
  }
  return p;
}

async function nameFrei(db, name, ausserId = 0) {
  const doppelt = await db.prepare('SELECT 1 FROM produkte WHERE lower(name) = lower(?) AND id <> ?').bind(name, ausserId).first();
  if (doppelt) throw new EingabeFehler('Ein Produkt mit diesem Namen gibt es schon.');
}

async function produktAnlegen(db, e) {
  const p = produktPruefen(e);
  await nameFrei(db, p.name);
  const zeile = await db.prepare(
    `INSERT INTO produkte (name, art, kategorie, startpreis_cent, beschreibung, pflichtangaben, allergene,
                           richtgewicht_von_g, richtgewicht_bis_g, aktiv, reihenfolge)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             (SELECT COALESCE(MAX(reihenfolge), 0) + 10 FROM produkte WHERE kategorie = ?))
     RETURNING id`
  ).bind(p.name, p.art, p.kategorie, p.startpreisCent, p.beschreibung, p.pflichtangaben, p.allergene,
    p.richtVonG, p.richtBisG, p.aktiv, p.kategorie).first();
  return { produktId: id(zeile.id) };
}

async function produktBearbeiten(db, produktId, e) {
  const pid = nummer(produktId, 'Produkt');
  const alt = await db.prepare(
    `SELECT art, EXISTS (SELECT 1 FROM charge_artikel WHERE produkt_id = produkte.id) AS verwendet
     FROM produkte WHERE id = ?`
  ).bind(pid).first();
  if (!alt) throw new EingabeFehler('Produkt nicht gefunden.');
  const p = produktPruefen(e);
  if (alt.verwendet && p.art !== alt.art && (alt.art === 'gewicht' || p.art === 'gewicht')) {
    throw new EingabeFehler('Das Produkt wurde schon verkauft – „nach Gewicht" bzw. „Fixpreis" lässt sich nicht mehr ändern. Bitte ein neues Produkt anlegen.');
  }
  await nameFrei(db, p.name, pid);
  await db.prepare(
    `UPDATE produkte SET name = ?, art = ?, kategorie = ?, startpreis_cent = ?, beschreibung = ?,
            pflichtangaben = ?, allergene = ?, richtgewicht_von_g = ?, richtgewicht_bis_g = ?, aktiv = ?
     WHERE id = ?`
  ).bind(p.name, p.art, p.kategorie, p.startpreisCent, p.beschreibung, p.pflichtangaben, p.allergene,
    p.richtVonG, p.richtBisG, p.aktiv, pid).run();
  return { produktId: id(pid) };
}

async function bestellungAendern(db, bestellungId, e) {
  const bid = nummer(bestellungId, 'Bestellnummer');
  const aenderung = (sql, ...werte) => db.prepare(
    `UPDATE bestellungen SET ${sql}, geaendert_am = datetime('now') WHERE id = ?`
  ).bind(...werte, bid).run();

  let r;
  switch (e.aktion) {
    case 'uebergeben':
      r = await aenderung(`uebergeben_am = ${e.wert ? "datetime('now')" : 'NULL'}`);
      break;
    case 'bezahlt':
      if (e.art) {
        r = await aenderung(
          `bezahlt_am = datetime('now'), bezahlt_art = ?,
           bezahlt_betrag_cent = (SELECT gesamt_cent FROM v_bestellsummen WHERE bestellung_id = bestellungen.id)`,
          auswahl(e.art, ZAHLARTEN, 'Zahlart')
        );
      } else {
        r = await aenderung('bezahlt_am = NULL, bezahlt_art = NULL, bezahlt_betrag_cent = NULL');
      }
      break;
    case 'zahlart':
      r = await aenderung('zahlart = ?', auswahl(e.zahlart, ZAHLARTEN, 'Zahlart'));
      break;
    case 'termin': {
      const tid = nummer(e.terminId, 'Termin');
      r = await db.prepare(
        `UPDATE bestellungen SET termin_id = ?, geaendert_am = datetime('now')
         WHERE id = ? AND EXISTS (SELECT 1 FROM termine t WHERE t.id = ? AND t.charge_id = bestellungen.charge_id)`
      ).bind(tid, bid, tid).run();
      if (!r.meta.changes) throw new EingabeFehler('Termin gehört nicht zu dieser Bestellrunde.');
      break;
    }
    case 'kontakt': {
      // Kontaktdaten des Kunden ergänzen (z. B. beim Bestätigen einer
      // übernommenen Voranmeldung) und Lieferadresse der Bestellung setzen
      const b = await db.prepare('SELECT kunde_id FROM bestellungen WHERE id = ?').bind(bid).first();
      if (!b) throw new EingabeFehler('Bestellung nicht gefunden.');
      await kundeSichern(db, b.kunde_id, e);
      const k = await db.prepare('SELECT strasse, plz, ort FROM kunden WHERE id = ?').bind(b.kunde_id).first();
      const adresse = k.strasse && k.ort ? `${k.strasse}, ${`${k.plz || ''} ${k.ort}`.trim()}` : null;
      r = await aenderung('lieferadresse = COALESCE(?, lieferadresse)', adresse);
      break;
    }
    case 'notiz':
      r = await aenderung('interne_notiz = ?', textOderNull(e.text, 1000));
      break;
    case 'stornieren':
      r = await aenderung(`status = 'storniert'`);
      break;
    case 'nachruecken':
      return { bestellung: await bestellungNachruecken(db, bid) };
    case 'gewicht': {
      const gewichtG = ganzzahl(e.gewichtG, 'Gewicht', { min: 1, max: 200000, leer: true });
      r = await gewichtSetzen(db, bid, nummer(e.positionId, 'Position'), gewichtG).run();
      if (!r.meta.changes) throw new EingabeFehler('Position nicht gefunden oder keine Gewichtsware.');
      break;
    }
    case 'position':
      return positionSetzen(db, bid, e);
    case 'abschliessen':
      return bestellungAbschliessen(db, bid, e);
    default:
      throw new EingabeFehler('Unbekannte Aktion.');
  }
  if (!r.meta.changes) throw new EingabeFehler('Bestellung nicht gefunden.');
  return {};
}

/* ------------------------------------------------------------
   5. CHARGEN
   Termine und Artikel werden als vollständige Liste geschickt: mit id =
   ändern, ohne id = neu, fehlend = entfernen (nur wenn noch unbenutzt).
   ------------------------------------------------------------ */
function chargePruefen(e) {
  const titel = text(e.titel, 120);
  if (!titel) throw new EingabeFehler('Bitte einen Titel eintragen.');
  const termine = (e.termine || []).map((t) => ({
    id: t.id ? nummer(t.id, 'Termin') : null,
    art: auswahl(t.art, ['abholung', 'lieferung'], 'Terminart'),
    datum: datum(t.datum, 'Termin'),
    von: uhrzeit(t.von),
    bis: uhrzeit(t.bis),
    hinweis: textOderNull(t.hinweis, 200),
  }));
  const artikel = (e.artikel || []).map((a) => ({
    id: a.id ? nummer(a.id, 'Artikel') : null,
    produktId: nummer(a.produktId, 'Produkt'),
    preisCent: ganzzahl(a.preisCent, 'Preis', { max: 10000000 }),
    kontingent: ganzzahl(a.kontingent, 'Menge', { max: 100000 }),
    max: ganzzahl(a.maxProBestellung, 'Höchstmenge', { min: 1, max: 100000, leer: true }),
  }));
  if (new Set(artikel.map((a) => a.produktId)).size !== artikel.length) {
    throw new EingabeFehler('Ein Produkt ist doppelt in der Bestellrunde.');
  }
  return {
    titel,
    bestellschluss: datum(e.bestellschluss, 'Bestellschluss'),
    status: auswahl(e.status || 'entwurf', CHARGE_STATUS, 'Status'),
    beschreibung: textOderNull(e.beschreibung, 1000),
    termine,
    artikel,
  };
}

function terminEinfuegen(db, chargeId, t) {
  return db.prepare('INSERT INTO termine (charge_id, art, datum, von, bis, hinweis) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(chargeId, t.art, t.datum, t.von, t.bis, t.hinweis);
}

function artikelEinfuegen(db, chargeId, a, reihenfolge) {
  return db.prepare(
    `INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent, max_pro_bestellung, reihenfolge)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(chargeId, a.produktId, a.preisCent, a.kontingent, a.max, reihenfolge);
}

async function chargeAnlegen(db, e) {
  const c = chargePruefen(e);
  const zeile = await db.prepare(
    'INSERT INTO chargen (titel, beschreibung, status, bestellschluss) VALUES (?, ?, ?, ?) RETURNING id'
  ).bind(c.titel, c.beschreibung, c.status, c.bestellschluss).first();
  const anweisungen = [
    ...c.termine.map((t) => terminEinfuegen(db, zeile.id, t)),
    ...c.artikel.map((a, i) => artikelEinfuegen(db, zeile.id, a, i)),
  ];
  try {
    if (anweisungen.length) await db.batch(anweisungen);
  } catch (fehler) {
    await db.prepare('DELETE FROM chargen WHERE id = ?').bind(zeile.id).run();
    throw fehler;
  }
  return { chargeId: id(zeile.id) };
}

async function chargeBearbeiten(db, chargeId, e) {
  const cid = nummer(chargeId, 'Bestellrunde');
  const c = chargePruefen(e);
  const vorhanden = await db.prepare('SELECT id FROM chargen WHERE id = ?').bind(cid).first();
  if (!vorhanden) throw new EingabeFehler('Bestellrunde nicht gefunden.');

  const [alteTermine, alteArtikel] = (await db.batch([
    db.prepare(`SELECT t.id, EXISTS (SELECT 1 FROM bestellungen b WHERE b.termin_id = t.id) AS benutzt
                FROM termine t WHERE t.charge_id = ?`).bind(cid),
    db.prepare(`SELECT ca.id, EXISTS (SELECT 1 FROM bestell_positionen p WHERE p.charge_artikel_id = ca.id) AS benutzt
                FROM charge_artikel ca WHERE ca.charge_id = ?`).bind(cid),
  ])).map((r) => r.results);

  const bleibendeTermine = new Set(c.termine.filter((t) => t.id).map((t) => t.id));
  const bleibendeArtikel = new Set(c.artikel.filter((a) => a.id).map((a) => a.id));
  for (const t of c.termine) {
    if (t.id && !alteTermine.some((x) => x.id === t.id)) throw new EingabeFehler('Termin gehört nicht zu dieser Bestellrunde.');
  }
  for (const a of c.artikel) {
    if (a.id && !alteArtikel.some((x) => x.id === a.id)) throw new EingabeFehler('Artikel gehört nicht zu dieser Bestellrunde.');
  }
  const entfernteTermine = alteTermine.filter((t) => !bleibendeTermine.has(t.id));
  const entfernteArtikel = alteArtikel.filter((a) => !bleibendeArtikel.has(a.id));
  if (entfernteTermine.some((t) => t.benutzt)) throw new EingabeFehler('Ein Termin hat schon Bestellungen und kann nicht entfernt werden.');
  if (entfernteArtikel.some((a) => a.benutzt)) throw new EingabeFehler('Ein Artikel wurde schon bestellt und kann nicht entfernt werden – Menge stattdessen auf die bestellte Zahl setzen.');

  await db.batch([
    db.prepare('UPDATE chargen SET titel = ?, beschreibung = ?, status = ?, bestellschluss = ? WHERE id = ?')
      .bind(c.titel, c.beschreibung, c.status, c.bestellschluss, cid),
    ...entfernteTermine.map((t) => db.prepare('DELETE FROM termine WHERE id = ? AND charge_id = ?').bind(t.id, cid)),
    ...entfernteArtikel.map((a) => db.prepare('DELETE FROM charge_artikel WHERE id = ? AND charge_id = ?').bind(a.id, cid)),
    ...c.termine.map((t) => (t.id
      ? db.prepare('UPDATE termine SET art = ?, datum = ?, von = ?, bis = ?, hinweis = ? WHERE id = ? AND charge_id = ?')
        .bind(t.art, t.datum, t.von, t.bis, t.hinweis, t.id, cid)
      : terminEinfuegen(db, cid, t))),
    // Preisänderungen gelten nur für neue Bestellungen (Einzelpreis ist je Position gespeichert)
    ...c.artikel.map((a, i) => (a.id
      ? db.prepare(`UPDATE charge_artikel SET preis_cent = ?, kontingent = ?, max_pro_bestellung = ?, reihenfolge = ?
                    WHERE id = ? AND charge_id = ?`).bind(a.preisCent, a.kontingent, a.max, i, a.id, cid)
      : artikelEinfuegen(db, cid, a, i))),
  ]);
  return { chargeId: id(cid) };
}

/* ------------------------------------------------------------
   5a. AUSWERTUNG FÜR DIE BUCHHALTUNG
   Zugeordnet wird nach dem Tag der Übergabe (Lieferung/Abholung). Was
   noch nicht übergeben ist, zählt noch zu keinem Jahr. Enthält auch
   abgeschlossene (archivierte) Bestellrunden. Die Rechnung je Position
   kommt aus v_positionen – dieselbe wie in der Oberfläche.
   ------------------------------------------------------------ */
async function auswertung(db, jahrText) {
  const { results: jahre } = await db.prepare(
    `SELECT DISTINCT substr(uebergeben_am, 1, 4) AS jahr FROM bestellungen
     WHERE uebergeben_am IS NOT NULL AND status = 'vorgemerkt' ORDER BY jahr DESC`
  ).all();
  const jahr = /^\d{4}$/.test(String(jahrText || '')) ? String(jahrText) : (jahre[0] ? jahre[0].jahr : String(new Date().getUTCFullYear()));
  const [bestellungen, positionen, runden] = (await db.batch([
    db.prepare(`SELECT b.id, b.nummer, b.charge_id, b.quelle, b.zahlart, b.bezahlt_art, b.bezahlt_am,
                       b.bezahlt_betrag_cent, b.uebergeben_am, b.erstellt_am, b.interne_notiz,
                       k.name AS kunde, s.gesamt_cent
                FROM bestellungen b JOIN kunden k ON k.id = b.kunde_id
                JOIN v_bestellsummen s ON s.bestellung_id = b.id
                WHERE b.status = 'vorgemerkt' AND substr(b.uebergeben_am, 1, 4) = ?
                ORDER BY b.uebergeben_am, b.id`).bind(jahr),
    db.prepare(`SELECT v.bestellung_id, v.produkt_name, v.art, v.menge, v.gewicht_g, v.betrag_cent, p.kategorie
                FROM v_positionen v JOIN produkte p ON p.id = v.produkt_id
                JOIN bestellungen b ON b.id = v.bestellung_id
                WHERE b.status = 'vorgemerkt' AND substr(b.uebergeben_am, 1, 4) = ?
                ORDER BY v.bestellung_id, v.id`).bind(jahr),
    // Runden mit Übergaben in diesem Jahr oder noch offene
    db.prepare(`SELECT c.id, c.titel, c.status, c.bestellschluss,
                       (SELECT COUNT(*) FROM bestellungen b WHERE b.charge_id = c.id AND b.status = 'vorgemerkt'
                          AND b.uebergeben_am IS NULL) AS nicht_uebergeben
                FROM chargen c
                WHERE c.status <> 'archiviert' OR EXISTS (SELECT 1 FROM bestellungen b WHERE b.charge_id = c.id
                  AND substr(b.uebergeben_am, 1, 4) = ?)
                ORDER BY c.bestellschluss, c.id`).bind(jahr),
  ])).map((r) => r.results);

  const jePos = new Map();
  for (const p of positionen) {
    if (!jePos.has(p.bestellung_id)) jePos.set(p.bestellung_id, []);
    jePos.get(p.bestellung_id).push({
      produkt: p.produkt_name, kategorie: p.kategorie, art: p.art, menge: p.menge,
      gewichtG: p.gewicht_g ?? null, cent: p.betrag_cent,
    });
  }
  return {
    jahr,
    jahre: [...new Set([jahr, ...jahre.map((j) => j.jahr)])].sort().reverse(),
    runden: runden.map((c) => ({
      id: id(c.id), titel: c.titel, status: c.status, bestellschluss: c.bestellschluss, nichtUebergeben: c.nicht_uebergeben,
    })),
    bestellungen: bestellungen.map((b) => ({
      id: id(b.id), nummer: b.nummer, chargeId: id(b.charge_id), kunde: b.kunde, quelle: b.quelle,
      hofverkauf: b.interne_notiz === 'Verkauf am Hof', zahlart: b.zahlart, bezahlt: b.bezahlt_art || null,
      bezahltAm: b.bezahlt_am ? String(b.bezahlt_am).slice(0, 10) : null,
      uebergebenAm: String(b.uebergeben_am).slice(0, 10), cent: b.gesamt_cent,
      positionen: jePos.get(b.id) || [],
    })),
  };
}

/* ------------------------------------------------------------
   6. VORANMELDUNGEN
   ------------------------------------------------------------ */
async function voranmeldungErfassen(db, e) {
  const kundeId = await kundeSichern(db, e.kundeId, e.kunde);
  const zeitraum = e.zeitraum;
  if (!ZEITRAEUME[zeitraum]) throw new EingabeFehler('Ungültiger Zeitraum.');
  const neueId = await voranmeldungAnlegen(db, {
    kundeId,
    produktId: nummer(e.produktId, 'Produkt'),
    menge: e.menge,
    zeitraum,
    jahr: e.jahr,
    quelle: auswahl(e.quelle || 'telefon', QUELLEN, 'Quelle'),
    notiz: textOderNull(e.notiz, 500),
  });
  return { voranmeldungId: id(neueId) };
}

/* ------------------------------------------------------------
   8. VERTEILER
   ------------------------------------------------------------ */
export async function onRequest({ request, env, params, data }) {
  if (!env.DB) return json({ ok: false, error: 'Datenbank nicht verbunden.' }, 503);
  const db = env.DB;
  const pfad = [].concat(params.pfad || []);
  const [bereich, teilId, unteraktion] = pfad;

  try {
    if (request.method === 'GET' && bereich === 'stand' && pfad.length === 1) {
      return json({ ok: true, nutzer: data.nutzer, ...(await standLaden(db, bankAusEnv(env))) });
    }
    if (request.method === 'GET' && bereich === 'auswertung' && pfad.length === 1) {
      return json({ ok: true, ...(await auswertung(db, new URL(request.url).searchParams.get('jahr'))) });
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'Nicht gefunden.' }, 404);
    if (!(request.headers.get('content-type') || '').includes('application/json')) {
      return json({ ok: false, error: 'Nur JSON-Anfragen.' }, 415);
    }
    const eingabe = await request.json().catch(() => {
      throw new EingabeFehler('Ungültige Anfrage.');
    });

    let ergebnis;
    if (bereich === 'bestellung' && pfad.length === 1) ergebnis = { bestellung: await bestellungErfassen(db, eingabe) };
    else if (bereich === 'bestellung' && pfad.length === 2) ergebnis = await bestellungAendern(db, teilId, eingabe);
    else if (bereich === 'charge' && pfad.length === 1) ergebnis = await chargeAnlegen(db, eingabe);
    else if (bereich === 'charge' && pfad.length === 2) ergebnis = await chargeBearbeiten(db, teilId, eingabe);
    else if (bereich === 'charge' && unteraktion === 'status' && pfad.length === 3) {
      const r = await db.prepare('UPDATE chargen SET status = ? WHERE id = ?')
        .bind(auswahl(eingabe.status, CHARGE_STATUS, 'Status'), nummer(teilId, 'Bestellrunde')).run();
      if (!r.meta.changes) throw new EingabeFehler('Bestellrunde nicht gefunden.');
      ergebnis = {};
    }
    else if (bereich === 'voranmeldung' && pfad.length === 1) ergebnis = await voranmeldungErfassen(db, eingabe);
    else if (bereich === 'hofverkauf' && pfad.length === 1) ergebnis = await hofverkauf(db, eingabe);
    else if (bereich === 'gesehen' && pfad.length === 1) ergebnis = await alsGesehen(db, eingabe);
    else if (bereich === 'tour' && pfad.length === 1) ergebnis = await tourSpeichern(db, eingabe);
    else if (bereich === 'produkt' && pfad.length === 1) ergebnis = await produktAnlegen(db, eingabe);
    else if (bereich === 'produkt' && pfad.length === 2) ergebnis = await produktBearbeiten(db, teilId, eingabe);
    else if (bereich === 'voranmeldung' && unteraktion === 'absagen' && pfad.length === 3) {
      const r = await db.prepare(
        `UPDATE voranmeldungen SET status = 'abgesagt', geaendert_am = datetime('now') WHERE id = ? AND status = 'offen'`
      ).bind(nummer(teilId, 'Voranmeldung')).run();
      if (!r.meta.changes) throw new EingabeFehler('Voranmeldung nicht gefunden oder nicht mehr offen.');
      ergebnis = {};
    } else if (bereich === 'widerruf' && unteraktion === 'erledigt' && pfad.length === 3) {
      const r = await db.prepare(
        `UPDATE widerrufe SET status = 'erledigt', erledigt_am = datetime('now') WHERE id = ? AND status = 'offen'`
      ).bind(nummer(teilId, 'Widerruf')).run();
      if (!r.meta.changes) throw new EingabeFehler('Widerruf nicht gefunden oder schon erledigt.');
      ergebnis = {};
    } else if (bereich === 'voranmeldungen' && teilId === 'uebernehmen' && pfad.length === 2) {
      const erg = await voranmeldungenUebernehmen(db, nummer(eingabe.chargeId, 'Bestellrunde'), eingabe.ids || []);
      ergebnis = {
        bestellungen: erg.bestellungen.map((b) => ({ id: id(b.id), nummer: b.nummer, status: b.status })),
        uebersprungen: erg.uebersprungen.map(id),
      };
    } else {
      return json({ ok: false, error: 'Nicht gefunden.' }, 404);
    }
    return json({ ok: true, ...ergebnis });
  } catch (fehler) {
    if (fehler instanceof EingabeFehler) return json({ ok: false, error: fehler.message }, 400);
    const meldung = String(fehler && fehler.message);
    if (/UNIQUE|CHECK|FOREIGN KEY/.test(meldung)) {
      console.error('Datenbank hat Eingabe abgelehnt:', meldung);
      return json({ ok: false, error: 'Die Eingabe passt nicht zu den gespeicherten Daten.' }, 400);
    }
    console.error('Verwaltung – Fehler:', fehler);
    return json({ ok: false, error: 'Interner Fehler – bitte später noch einmal versuchen.' }, 500);
  }
}
