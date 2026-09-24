/* ============================================================
 * BEISPIELDATEN – Entwurf der Hofladen-Verwaltung
 * ============================================================
 * Frei erfundene Kunden, Bestellungen und Preise, nur damit man den
 * Entwurf durchklicken kann. Keine echten Personen, keine echten Preise.
 * In der fertigen Lösung kommen diese Daten aus der D1-Datenbank.
 *
 * Beträge in Cent, Gewichte in Gramm.
 * ============================================================ */

'use strict';

const ENTWURF_DATEN = {
  // Liefergebiet 6252, 6233, 6230, 6250 – Reihenfolge der Liefertour
  // (Vorschlag, wie in hofladen-produkte.sql). Andere Orte: nur Abholung.
  tourReihenfolge: ['Breitenbach am Inn', 'Kramsach', 'Brixlegg', 'Kundl'],

  // Produktkatalog (Preise stehen je Charge) – echtes Sortiment, Stand 09/2026
  // Gleiche Felder wie /api/verwaltung/stand
  produkte: [
    { id: 'p1', name: 'Masthuhn ganz', art: 'gewicht', kategorie: 'fleisch', richtVonG: 1800, richtBisG: 2400, startpreisCent: 1200 },
    { id: 'p8', name: 'Masthuhn halbiert', art: 'gewicht', kategorie: 'fleisch', richtVonG: 900, richtBisG: 1200, startpreisCent: 1200 },
    { id: 'p7', name: 'Pute ganz, zerlegt', art: 'gewicht', kategorie: 'fleisch', richtVonG: 6000, richtBisG: 9000, startpreisCent: 1750 },
    { id: 'p5', name: 'Rindfleischpaket 5 kg', art: 'paket', kategorie: 'fleisch', startpreisCent: 7500 },
    { id: 'p6', name: 'Rindfleischpaket 10 kg', art: 'paket', kategorie: 'fleisch', startpreisCent: 14000 },
    { id: 'p4', name: 'Gans', art: 'gewicht', kategorie: 'fleisch', richtVonG: 3000, richtBisG: 4500, startpreisCent: 1900 },
    { id: 'p9', name: 'Eiernudeln Spaghetti 500 g', art: 'stueck', kategorie: 'nudeln', startpreisCent: 400 },
    { id: 'p11', name: 'Eiernudeln Hörnchen 500 g', art: 'stueck', kategorie: 'nudeln', startpreisCent: 400 },
    { id: 'p10', name: 'Eiernudeln Spirelli 500 g', art: 'stueck', kategorie: 'nudeln', startpreisCent: 400 },
    { id: 'p12', name: 'Eiernudeln Rotunde 500 g', art: 'stueck', kategorie: 'nudeln', startpreisCent: 400 },
    { id: 'p13', name: 'Eiernudeln Pappardelle 500 g', art: 'stueck', kategorie: 'nudeln', startpreisCent: 400 },
    { id: 'p2', name: 'Eiernudeln Bandnudeln 500 g', art: 'stueck', kategorie: 'nudeln', startpreisCent: 400 },
    { id: 'p3', name: 'Raphaels Wald- & Blütenhonig 500 g', art: 'stueck', kategorie: 'honig', startpreisCent: 1200 },
    { id: 'p14', name: 'Alpakaseife', art: 'stueck', kategorie: 'seife', startpreisCent: 450 },
  ],

  // Termine, Mengen und Bestellungen sind erfunden; Preise wie angegeben.
  // Nudeln: je Charge nur die Sorten, die gerade da sind.
  chargen: [
    {
      id: 'c1',
      titel: 'Masthühner Herbst',
      bestellschluss: '2026-10-01',
      termine: [
        { id: 't1', art: 'lieferung', datum: '2026-10-09', von: '14:00', bis: '18:00' },
        { id: 't2', art: 'abholung', datum: '2026-10-10', von: '09:00', bis: '12:00' },
      ],
      artikel: [
        { id: 'a1', produktId: 'p1', name: 'Masthuhn ganz', art: 'gewicht', preisCent: 1200, kontingent: 40, richtVonG: 1800, richtBisG: 2400 },
        { id: 'a8', produktId: 'p8', name: 'Masthuhn halbiert', art: 'gewicht', preisCent: 1200, kontingent: 10, richtVonG: 900, richtBisG: 1200 },
        { id: 'a2', produktId: 'p2', name: 'Eiernudeln Bandnudeln 500 g', art: 'stueck', preisCent: 400, kontingent: 20 },
        { id: 'a9', produktId: 'p9', name: 'Eiernudeln Spaghetti 500 g', art: 'stueck', preisCent: 400, kontingent: 15 },
        { id: 'a10', produktId: 'p10', name: 'Eiernudeln Spirelli 500 g', art: 'stueck', preisCent: 400, kontingent: 10 },
        { id: 'a3', produktId: 'p3', name: 'Raphaels Wald- & Blütenhonig 500 g', art: 'stueck', preisCent: 1200, kontingent: 25 },
        { id: 'a11', produktId: 'p14', name: 'Alpakaseife', art: 'stueck', preisCent: 450, kontingent: 15 },
      ],
    },
    {
      id: 'c2',
      titel: 'Advent: Pute & Rind',
      bestellschluss: '2026-12-06',
      termine: [
        { id: 't3', art: 'lieferung', datum: '2026-12-18', von: '14:00', bis: '18:00' },
        { id: 't4', art: 'abholung', datum: '2026-12-19', von: '09:00', bis: '12:00' },
      ],
      artikel: [
        { id: 'a4', produktId: 'p7', name: 'Pute ganz, zerlegt', art: 'gewicht', preisCent: 1750, kontingent: 8, richtVonG: 6000, richtBisG: 9000 },
        { id: 'a5', produktId: 'p5', name: 'Rindfleischpaket 5 kg', art: 'paket', preisCent: 7500, kontingent: 12 },
        { id: 'a6', produktId: 'p6', name: 'Rindfleischpaket 10 kg', art: 'paket', preisCent: 14000, kontingent: 6 },
        { id: 'a7', produktId: 'p3', name: 'Raphaels Wald- & Blütenhonig 500 g', art: 'stueck', preisCent: 1200, kontingent: 20 },
      ],
    },
  ],

  kunden: [
    { id: 'k1', name: 'Maria Huber', telefon: '+43 660 0000001', strasse: 'Dorfstraße 4', plz: '6252', ort: 'Breitenbach am Inn', stammkunde: true },
    { id: 'k2', name: 'Josef Brunner', telefon: '+43 660 0000002', strasse: 'Bahnhofstraße 12', plz: '6250', ort: 'Kundl', stammkunde: true },
    { id: 'k3', name: 'Anna Mair', telefon: '+43 660 0000003', strasse: 'Innweg 30', plz: '6233', ort: 'Kramsach', stammkunde: true },
    { id: 'k4', name: 'Thomas Hofer', telefon: '+43 660 0000004', strasse: 'Achenrainweg 7', plz: '6233', ort: 'Kramsach', stammkunde: false },
    { id: 'k5', name: 'Elisabeth Egger', telefon: '+43 660 0000005', strasse: 'Kirchweg 2', plz: '6241', ort: 'Radfeld', stammkunde: true },
    { id: 'k6', name: 'Stefan Moser', telefon: '+43 660 0000006', strasse: 'Schmiedgasse 9', plz: '6252', ort: 'Breitenbach am Inn', stammkunde: true },
    { id: 'k7', name: 'Theresia Gruber', telefon: '+43 660 0000007', strasse: 'Marktstraße 15', plz: '6230', ort: 'Brixlegg', stammkunde: false },
    { id: 'k8', name: 'Martin Haas', telefon: '+43 660 0000008', strasse: 'Au 3', plz: '6250', ort: 'Kundl', stammkunde: false },
    { id: 'k9', name: 'Christina Pichler', telefon: '+43 660 0000009', strasse: 'Innstraße 21', plz: '6300', ort: 'Wörgl', stammkunde: true },
    { id: 'k10', name: 'Georg Steiner', telefon: '+43 660 0000010', strasse: 'Dorf 11', plz: '6230', ort: 'Brixlegg', stammkunde: true },
    { id: 'k11', name: 'Barbara Wimmer', telefon: '+43 660 0000011', strasse: 'Kleinsöll 8', plz: '6252', ort: 'Breitenbach am Inn', stammkunde: false },
    { id: 'k12', name: 'Johann Lechner', telefon: '+43 660 0000012', strasse: 'Seeweg 6', plz: '6233', ort: 'Kramsach', stammkunde: false },
    { id: 'k13', name: 'Sabine Fuchs', telefon: '+43 660 0000013', strasse: 'Südtiroler Straße 3', plz: '6240', ort: 'Rattenberg', stammkunde: false },
    { id: 'k14', name: 'Peter Kogler', telefon: '+43 660 0000014', strasse: 'Feldweg 1', plz: '6250', ort: 'Kundl', stammkunde: true },
  ],

  // Voranmeldungen: unverbindlich, noch ohne Preis und Termin
  // zeitraum: 'naechste' | 'fruehjahr' | 'sommer' | 'herbst' | 'martini' | 'weihnachten'
  voranmeldungen: [
    { id: 'v1', kundeId: 'k4', produktId: 'p4', menge: 1, zeitraum: 'martini', jahr: 2026, quelle: 'telefon', status: 'offen', erstellt: '2026-03-14', notiz: '' },
    { id: 'v2', kundeId: 'k7', produktId: 'p4', menge: 2, zeitraum: 'martini', jahr: 2026, quelle: 'whatsapp', status: 'offen', erstellt: '2026-04-02', notiz: 'Eine davon für die Schwiegermutter.' },
    { id: 'v3', kundeId: 'k12', produktId: 'p5', menge: 1, zeitraum: 'martini', jahr: 2026, quelle: 'web', status: 'offen', erstellt: '2026-05-20', notiz: '' },
    { id: 'v4', kundeId: 'k9', produktId: 'p3', menge: 2, zeitraum: 'naechste', jahr: null, quelle: 'persoenlich', status: 'offen', erstellt: '2026-09-02', notiz: '' },
    { id: 'v5', kundeId: 'k6', produktId: 'p7', menge: 1, zeitraum: 'weihnachten', jahr: 2026, quelle: 'whatsapp', status: 'offen', erstellt: '2026-06-11', notiz: '' },
    { id: 'v6', kundeId: 'k10', produktId: 'p7', menge: 1, zeitraum: 'weihnachten', jahr: 2026, quelle: 'web', status: 'offen', erstellt: '2026-07-01', notiz: '' },
    { id: 'v7', kundeId: 'k1', produktId: 'p1', menge: 3, zeitraum: 'fruehjahr', jahr: 2027, quelle: 'whatsapp', status: 'offen', erstellt: '2026-09-15', notiz: '' },
    { id: 'v8', kundeId: 'k5', produktId: 'p1', menge: 4, zeitraum: 'fruehjahr', jahr: 2027, quelle: 'telefon', status: 'offen', erstellt: '2026-09-17', notiz: '' },
    { id: 'v9', kundeId: 'k11', produktId: 'p1', menge: 2, zeitraum: 'fruehjahr', jahr: 2027, quelle: 'web', status: 'offen', erstellt: '2026-09-22', notiz: '' },
  ],

  // status: 'vorgemerkt' | 'warteliste' | 'storniert'
  // bezahlt: null | 'bar' | 'ueberweisung'
  // quelle: 'web' | 'whatsapp' | 'telefon' | 'persoenlich'
  bestellungen: [
    { id: 'b1', nummer: '2026-001', chargeId: 'c1', kundeId: 'k1', quelle: 'web', erstellt: '2026-09-15', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 3, gewichtG: 6150 }, { artikelId: 'a2', menge: 2 }] },
    { id: 'b2', nummer: '2026-002', chargeId: 'c1', kundeId: 'k2', quelle: 'whatsapp', erstellt: '2026-09-15', status: 'vorgemerkt', terminId: 't1', zahlart: 'ueberweisung', bezahlt: 'ueberweisung', uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 2, gewichtG: 3980 }] },
    { id: 'b3', nummer: '2026-003', chargeId: 'c1', kundeId: 'k3', quelle: 'web', erstellt: '2026-09-16', status: 'vorgemerkt', terminId: 't1', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 4 }, { artikelId: 'a3', menge: 1 }] },
    { id: 'b4', nummer: '2026-004', chargeId: 'c1', kundeId: 'k4', quelle: 'telefon', erstellt: '2026-09-16', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 2 }, { artikelId: 'a2', menge: 3 }, { artikelId: 'a3', menge: 2 }, { artikelId: 'a11', menge: 2 }] },
    { id: 'b5', nummer: '2026-005', chargeId: 'c1', kundeId: 'k5', quelle: 'whatsapp', erstellt: '2026-09-17', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: 'Bitte eher größere Hühner.',
      positionen: [{ artikelId: 'a1', menge: 5 }] },
    { id: 'b6', nummer: '2026-006', chargeId: 'c1', kundeId: 'k6', quelle: 'web', erstellt: '2026-09-18', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 2, gewichtG: 4210 }, { artikelId: 'a3', menge: 1 }] },
    { id: 'b7', nummer: '2026-007', chargeId: 'c1', kundeId: 'k7', quelle: 'whatsapp', erstellt: '2026-09-18', status: 'vorgemerkt', terminId: 't1', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 3 }, { artikelId: 'a10', menge: 2 }] },
    { id: 'b8', nummer: '2026-008', chargeId: 'c1', kundeId: 'k8', quelle: 'web', erstellt: '2026-09-19', status: 'vorgemerkt', terminId: 't1', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: 'Lieferung bitte nach 16 Uhr.',
      positionen: [{ artikelId: 'a1', menge: 4 }] },
    { id: 'b9', nummer: '2026-009', chargeId: 'c1', kundeId: 'k9', quelle: 'persoenlich', erstellt: '2026-09-20', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 2 }, { artikelId: 'a2', menge: 1 }] },
    { id: 'b10', nummer: '2026-010', chargeId: 'c1', kundeId: 'k10', quelle: 'web', erstellt: '2026-09-21', status: 'vorgemerkt', terminId: 't1', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 3 }, { artikelId: 'a3', menge: 2 }] },
    { id: 'b11', nummer: '2026-011', chargeId: 'c1', kundeId: 'k11', quelle: 'whatsapp', erstellt: '2026-09-22', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 4 }, { artikelId: 'a9', menge: 4 }] },
    { id: 'b12', nummer: '2026-012', chargeId: 'c1', kundeId: 'k12', quelle: 'web', erstellt: '2026-09-23', status: 'vorgemerkt', terminId: 't2', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 3 }, { artikelId: 'a8', menge: 2 }] },
    { id: 'b13', nummer: '2026-013', chargeId: 'c1', kundeId: 'k13', quelle: 'web', erstellt: '2026-09-24', status: 'warteliste', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: 'Nehme auch weniger, falls nicht alle gehen.',
      positionen: [{ artikelId: 'a1', menge: 4 }] },

    { id: 'b14', nummer: '2026-014', chargeId: 'c2', kundeId: 'k1', quelle: 'web', erstellt: '2026-09-20', status: 'vorgemerkt', terminId: 't4', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a4', menge: 1 }, { artikelId: 'a5', menge: 1 }] },
    { id: 'b15', nummer: '2026-015', chargeId: 'c2', kundeId: 'k3', quelle: 'whatsapp', erstellt: '2026-09-21', status: 'vorgemerkt', terminId: 't3', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a6', menge: 1 }] },
    { id: 'b16', nummer: '2026-016', chargeId: 'c2', kundeId: 'k6', quelle: 'telefon', erstellt: '2026-09-22', status: 'vorgemerkt', terminId: 't4', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: 'Eine Pute eher klein.',
      positionen: [{ artikelId: 'a4', menge: 2 }] },
    { id: 'b17', nummer: '2026-017', chargeId: 'c2', kundeId: 'k14', quelle: 'web', erstellt: '2026-09-23', status: 'vorgemerkt', terminId: 't3', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a5', menge: 2 }, { artikelId: 'a7', menge: 1 }] },
    { id: 'b18', nummer: '2026-018', chargeId: 'c2', kundeId: 'k10', quelle: 'web', erstellt: '2026-09-23', status: 'vorgemerkt', terminId: 't4', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a4', menge: 1 }, { artikelId: 'a6', menge: 1 }] },
    { id: 'b19', nummer: '2026-019', chargeId: 'c2', kundeId: 'k2', quelle: 'whatsapp', erstellt: '2026-09-24', status: 'vorgemerkt', terminId: 't4', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a5', menge: 1 }] },
  ],
};
