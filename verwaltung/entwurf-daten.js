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
  // Reihenfolge der Orte für die Liefertour (vom Hof aus gedacht)
  tourReihenfolge: ['Breitenbach am Inn', 'Kundl', 'Angath', 'Wörgl', 'Radfeld', 'Rattenberg', 'Brixlegg', 'Kramsach'],

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
        { id: 'a1', name: 'Masthuhn', art: 'gewicht', preisCent: 1390, kontingent: 40, richtVonG: 1800, richtBisG: 2200 },
        { id: 'a2', name: 'Eiernudeln 500 g', art: 'stueck', preisCent: 450, kontingent: 40 },
        { id: 'a3', name: 'Honig 500 g', art: 'stueck', preisCent: 900, kontingent: 25 },
      ],
    },
    {
      id: 'c2',
      titel: 'Martini: Gans & Rind',
      bestellschluss: '2026-10-25',
      termine: [
        { id: 't3', art: 'lieferung', datum: '2026-11-06', von: '14:00', bis: '18:00' },
        { id: 't4', art: 'abholung', datum: '2026-11-07', von: '09:00', bis: '12:00' },
      ],
      artikel: [
        { id: 'a4', name: 'Gans', art: 'gewicht', preisCent: 1690, kontingent: 15, richtVonG: 4500, richtBisG: 5500 },
        { id: 'a5', name: 'Rindfleisch-Paket 5 kg', art: 'paket', preisCent: 10500, kontingent: 12 },
        { id: 'a6', name: 'Rindfleisch-Paket 10 kg', art: 'paket', preisCent: 19900, kontingent: 6 },
        { id: 'a7', name: 'Honig 500 g', art: 'stueck', preisCent: 900, kontingent: 20 },
      ],
    },
  ],

  kunden: [
    { id: 'k1', name: 'Maria Huber', telefon: '+43 660 0000001', strasse: 'Dorfstraße 4', plz: '6252', ort: 'Breitenbach am Inn', stammkunde: true },
    { id: 'k2', name: 'Josef Brunner', telefon: '+43 660 0000002', strasse: 'Bahnhofstraße 12', plz: '6250', ort: 'Kundl', stammkunde: true },
    { id: 'k3', name: 'Anna Mair', telefon: '+43 660 0000003', strasse: 'Salzburger Straße 30', plz: '6300', ort: 'Wörgl', stammkunde: true },
    { id: 'k4', name: 'Thomas Hofer', telefon: '+43 660 0000004', strasse: 'Achenrainweg 7', plz: '6233', ort: 'Kramsach', stammkunde: false },
    { id: 'k5', name: 'Elisabeth Egger', telefon: '+43 660 0000005', strasse: 'Kirchweg 2', plz: '6241', ort: 'Radfeld', stammkunde: true },
    { id: 'k6', name: 'Stefan Moser', telefon: '+43 660 0000006', strasse: 'Schmiedgasse 9', plz: '6252', ort: 'Breitenbach am Inn', stammkunde: true },
    { id: 'k7', name: 'Theresia Gruber', telefon: '+43 660 0000007', strasse: 'Marktstraße 15', plz: '6230', ort: 'Brixlegg', stammkunde: false },
    { id: 'k8', name: 'Martin Haas', telefon: '+43 660 0000008', strasse: 'Au 3', plz: '6250', ort: 'Kundl', stammkunde: false },
    { id: 'k9', name: 'Christina Pichler', telefon: '+43 660 0000009', strasse: 'Innstraße 21', plz: '6300', ort: 'Wörgl', stammkunde: true },
    { id: 'k10', name: 'Georg Steiner', telefon: '+43 660 0000010', strasse: 'Dorf 11', plz: '6321', ort: 'Angath', stammkunde: true },
    { id: 'k11', name: 'Barbara Wimmer', telefon: '+43 660 0000011', strasse: 'Kleinsöll 8', plz: '6252', ort: 'Breitenbach am Inn', stammkunde: false },
    { id: 'k12', name: 'Johann Lechner', telefon: '+43 660 0000012', strasse: 'Seeweg 6', plz: '6233', ort: 'Kramsach', stammkunde: false },
    { id: 'k13', name: 'Sabine Fuchs', telefon: '+43 660 0000013', strasse: 'Südtiroler Straße 3', plz: '6240', ort: 'Rattenberg', stammkunde: false },
    { id: 'k14', name: 'Peter Kogler', telefon: '+43 660 0000014', strasse: 'Feldweg 1', plz: '6241', ort: 'Radfeld', stammkunde: true },
  ],

  // status: 'vorgemerkt' | 'warteliste' | 'storniert'
  // bezahlt: null | 'bar' | 'ueberweisung'
  // quelle: 'web' | 'whatsapp' | 'telefon' | 'persoenlich'
  bestellungen: [
    { id: 'b1', nummer: 'HK-26-001', chargeId: 'c1', kundeId: 'k1', quelle: 'web', erstellt: '2026-09-15', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 3, gewichtG: 6150 }, { artikelId: 'a2', menge: 2 }] },
    { id: 'b2', nummer: 'HK-26-002', chargeId: 'c1', kundeId: 'k2', quelle: 'whatsapp', erstellt: '2026-09-15', status: 'vorgemerkt', terminId: 't1', zahlart: 'ueberweisung', bezahlt: 'ueberweisung', uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 2, gewichtG: 3980 }] },
    { id: 'b3', nummer: 'HK-26-003', chargeId: 'c1', kundeId: 'k3', quelle: 'web', erstellt: '2026-09-16', status: 'vorgemerkt', terminId: 't1', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 4 }, { artikelId: 'a3', menge: 1 }] },
    { id: 'b4', nummer: 'HK-26-004', chargeId: 'c1', kundeId: 'k4', quelle: 'telefon', erstellt: '2026-09-16', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 2 }, { artikelId: 'a2', menge: 3 }, { artikelId: 'a3', menge: 2 }] },
    { id: 'b5', nummer: 'HK-26-005', chargeId: 'c1', kundeId: 'k5', quelle: 'whatsapp', erstellt: '2026-09-17', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: 'Bitte eher größere Hühner.',
      positionen: [{ artikelId: 'a1', menge: 5 }] },
    { id: 'b6', nummer: 'HK-26-006', chargeId: 'c1', kundeId: 'k6', quelle: 'web', erstellt: '2026-09-18', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 2, gewichtG: 4210 }, { artikelId: 'a3', menge: 1 }] },
    { id: 'b7', nummer: 'HK-26-007', chargeId: 'c1', kundeId: 'k7', quelle: 'whatsapp', erstellt: '2026-09-18', status: 'vorgemerkt', terminId: 't1', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 3 }, { artikelId: 'a2', menge: 2 }] },
    { id: 'b8', nummer: 'HK-26-008', chargeId: 'c1', kundeId: 'k8', quelle: 'web', erstellt: '2026-09-19', status: 'vorgemerkt', terminId: 't1', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: 'Lieferung bitte nach 16 Uhr.',
      positionen: [{ artikelId: 'a1', menge: 4 }] },
    { id: 'b9', nummer: 'HK-26-009', chargeId: 'c1', kundeId: 'k9', quelle: 'persoenlich', erstellt: '2026-09-20', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 2 }, { artikelId: 'a2', menge: 1 }] },
    { id: 'b10', nummer: 'HK-26-010', chargeId: 'c1', kundeId: 'k10', quelle: 'web', erstellt: '2026-09-21', status: 'vorgemerkt', terminId: 't1', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 3 }, { artikelId: 'a3', menge: 2 }] },
    { id: 'b11', nummer: 'HK-26-011', chargeId: 'c1', kundeId: 'k11', quelle: 'whatsapp', erstellt: '2026-09-22', status: 'vorgemerkt', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 4 }, { artikelId: 'a2', menge: 4 }] },
    { id: 'b12', nummer: 'HK-26-012', chargeId: 'c1', kundeId: 'k12', quelle: 'web', erstellt: '2026-09-23', status: 'vorgemerkt', terminId: 't2', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a1', menge: 3 }] },
    { id: 'b13', nummer: 'HK-26-013', chargeId: 'c1', kundeId: 'k13', quelle: 'web', erstellt: '2026-09-24', status: 'warteliste', terminId: 't2', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: 'Nehme auch weniger, falls nicht alle gehen.',
      positionen: [{ artikelId: 'a1', menge: 4 }] },

    { id: 'b14', nummer: 'HK-26-014', chargeId: 'c2', kundeId: 'k1', quelle: 'web', erstellt: '2026-09-20', status: 'vorgemerkt', terminId: 't4', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a4', menge: 1 }, { artikelId: 'a5', menge: 1 }] },
    { id: 'b15', nummer: 'HK-26-015', chargeId: 'c2', kundeId: 'k3', quelle: 'whatsapp', erstellt: '2026-09-21', status: 'vorgemerkt', terminId: 't3', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a6', menge: 1 }] },
    { id: 'b16', nummer: 'HK-26-016', chargeId: 'c2', kundeId: 'k6', quelle: 'telefon', erstellt: '2026-09-22', status: 'vorgemerkt', terminId: 't4', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: 'Eine Gans eher klein.',
      positionen: [{ artikelId: 'a4', menge: 2 }] },
    { id: 'b17', nummer: 'HK-26-017', chargeId: 'c2', kundeId: 'k14', quelle: 'web', erstellt: '2026-09-23', status: 'vorgemerkt', terminId: 't3', zahlart: 'ueberweisung', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a5', menge: 2 }, { artikelId: 'a7', menge: 1 }] },
    { id: 'b18', nummer: 'HK-26-018', chargeId: 'c2', kundeId: 'k10', quelle: 'web', erstellt: '2026-09-23', status: 'vorgemerkt', terminId: 't4', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a4', menge: 1 }, { artikelId: 'a6', menge: 1 }] },
    { id: 'b19', nummer: 'HK-26-019', chargeId: 'c2', kundeId: 'k2', quelle: 'whatsapp', erstellt: '2026-09-24', status: 'vorgemerkt', terminId: 't4', zahlart: 'bar', bezahlt: null, uebergeben: false, anmerkung: '',
      positionen: [{ artikelId: 'a5', menge: 1 }] },
  ],
};
