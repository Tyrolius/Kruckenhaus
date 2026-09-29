/* ============================================================
 * TEST – Überweisungs-QR-Code (js/qrcode.js)
 * ============================================================
 * Prüft den EPC-Inhalt (Aufbau nach EPC069-12, Version 002) und den
 * QR-Kodierer: Größe, Suchmuster, Formatinformation (Stufe M) und einen
 * Referenz-Fingerabdruck. Die Referenzcodes wurden einmalig mit einem
 * unabhängigen QR-Decoder gegengelesen; ändert sich der Kodierer, muss
 * das erneut geschehen.
 *
 * Aufruf (Node 22 oder neuer):  node scripts/test-hofladen-qr.mjs
 * ============================================================ */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInThisContext } from 'node:vm';
import assert from 'node:assert/strict';

runInThisContext(readFileSync(new URL('../js/qrcode.js', import.meta.url), 'utf8'));
const { epcText, qrMatrix, svg } = globalThis.KruckenhausQr;

// EPC-Inhalt
const epc = epcText({ name: '  Test  Inhaber ', iban: 'at00 0000 0000 0000 0000', bic: 'testatxx', betragCent: 8240, zweck: 'Bestellung 2026-001' });
assert.equal(epc, 'BCD\n002\n1\nSCT\nTESTATXX\nTest Inhaber\nAT000000000000000000\nEUR82.40\n\n\nBestellung 2026-001');
assert.match(epcText({ name: 'A', iban: 'AT00', betragCent: 5 }), /\nEUR0\.05\n/);
assert.match(epcText({ name: 'A', iban: 'AT00', betragCent: 120000 }), /\nEUR1200\.00\n/);
assert.equal(epcText({ name: 'x'.repeat(90), iban: 'AT00', betragCent: 1 }).split('\n')[5].length, 70);
assert.throws(() => epcText({ name: 'A', iban: 'AT00', betragCent: 0 }));
assert.throws(() => epcText({ name: 'A', iban: 'AT00', betragCent: 12.5 }));
assert.throws(() => epcText({ name: '', iban: 'AT00', betragCent: 100 }));
console.log('✓ EPC-Inhalt: Zeilen, Betrag mit Punkt, Kürzung, ungültige Angaben abgelehnt');

// Formatinformation lesen: Stufe M (00) und gültige BCH-Prüfung
function formatPruefen(m) {
  let bits = 0;
  for (let i = 0; i <= 5; i++) bits |= (m[i][8] ? 1 : 0) << i;
  bits |= (m[7][8] ? 1 : 0) << 6;
  bits |= (m[8][8] ? 1 : 0) << 7;
  bits |= (m[8][7] ? 1 : 0) << 8;
  for (let i = 9; i < 15; i++) bits |= (m[8][14 - i] ? 1 : 0) << i;
  const roh = bits ^ 0x5412;
  const daten = roh >>> 10;
  let rest = daten;
  for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  assert.equal(roh, (daten << 10) | rest, 'BCH-Prüfung der Formatinformation');
  assert.equal(daten >>> 3, 0, 'Fehlerkorrektur-Stufe M');
}

function suchmusterPruefen(m, x0, y0) {
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      assert.equal(m[y0 + dy][x0 + dx], d !== 2, 'Suchmuster');
    }
  }
}

const fingerabdruck = (m) => createHash('sha256').update(m.map((r) => r.map((v) => (v ? 1 : 0)).join('')).join('\n')).digest('hex').slice(0, 16);

const faelle = [
  { text: 'BCD\n002\n1\nSCT\nTESTATXX\nFlorian Häusler Kathrin Häusler\nAT001234567890123456\nEUR82.40\n\n\nBestellung 2026-001', groesse: 45 },
  { text: 'y'.repeat(300), groesse: 69 },
];
const erwartet = {};
for (const { text, groesse } of faelle) {
  const m = qrMatrix(text);
  assert.equal(m.length, groesse);
  suchmusterPruefen(m, 0, 0);
  suchmusterPruefen(m, groesse - 7, 0);
  suchmusterPruefen(m, 0, groesse - 7);
  formatPruefen(m);
  erwartet[groesse] = fingerabdruck(m);
}
assert.deepEqual(erwartet, { 45: '8e70a0db9f43598f', 69: 'bba5be6f30ab04e2' });
console.log('✓ QR-Code: Größe, Suchmuster, Formatinformation Stufe M, Referenz-Fingerabdruck');

const bild = svg(epc, { titel: 'Überweisung <Test>' });
assert.match(bild, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
assert.match(bild, /<title>Überweisung &lt;Test&gt;<\/title>/);
assert.throws(() => qrMatrix('z'.repeat(3000)), /zu lang/);
console.log('✓ SVG mit Titel (escaped), zu langer Text abgelehnt');

console.log('\nAlle Tests bestanden.');
