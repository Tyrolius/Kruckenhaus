/* ============================================================
 * ÜBERWEISUNGS-QR-CODE (EPC-QR / „GiroCode")
 * ============================================================
 * Erzeugt ohne fremde Bibliothek einen QR-Code als SVG. Verwendet auf dem
 * Packzettel (verwaltung/) und bei „Meine Bestellungen".
 *
 * Inhalt nach EPC069-12 (Version 002): Banking-Apps lesen daraus Empfänger,
 * IBAN, Betrag und Verwendungszweck – der Kunde muss nichts abtippen.
 * Fehlerkorrektur-Stufe M ist dort vorgeschrieben.
 *
 * Aufbau des Kodierers: Byte-Modus, Versionen 1–40, Reed-Solomon,
 * Maskenwahl nach den Strafpunkten der QR-Norm.
 *
 * Bereitgestellt als globales Objekt KruckenhausQr:
 *   KruckenhausQr.epcText({ name, iban, bic, betragCent, zweck }) → String
 *   KruckenhausQr.svg(text, { titel })                          → SVG-String
 * ============================================================ */

'use strict';

(function () {
  /* ------------------------------------------------------------
     1. TABELLEN (nur Fehlerkorrektur-Stufe M)
     ------------------------------------------------------------ */
  // Index = Version (1–40)
  const ECC_JE_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
    26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  const BLOECKE = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14,
    16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  const FORMAT_M = 0; // Formatbits der Stufe M

  /* ------------------------------------------------------------
     2. HILFSFUNKTIONEN
     ------------------------------------------------------------ */
  function bit(wert, i) {
    return ((wert >>> i) & 1) !== 0;
  }

  // Anzahl der Module, die nach Abzug aller Funktionsmuster Daten tragen
  function rohModule(ver) {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const ausr = Math.floor(ver / 7) + 2;
      n -= (25 * ausr - 10) * ausr - 55;
      if (ver >= 7) n -= 36;
    }
    return n;
  }

  function datenCodewoerter(ver) {
    return Math.floor(rohModule(ver) / 8) - ECC_JE_BLOCK[ver] * BLOECKE[ver];
  }

  // Multiplikation im Galoiskörper GF(2^8), Polynom 0x11D
  function gfMal(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsTeiler(grad) {
    const erg = new Array(grad - 1).fill(0);
    erg.push(1);
    let wurzel = 1;
    for (let i = 0; i < grad; i++) {
      for (let j = 0; j < erg.length; j++) {
        erg[j] = gfMal(erg[j], wurzel);
        if (j + 1 < erg.length) erg[j] ^= erg[j + 1];
      }
      wurzel = gfMal(wurzel, 0x02);
    }
    return erg;
  }

  function rsRest(daten, teiler) {
    const erg = teiler.map(() => 0);
    for (const b of daten) {
      const faktor = b ^ erg.shift();
      erg.push(0);
      teiler.forEach((k, i) => { erg[i] ^= gfMal(k, faktor); });
    }
    return erg;
  }

  /* ------------------------------------------------------------
     3. DATEN KODIEREN (Byte-Modus)
     ------------------------------------------------------------ */
  function kodieren(bytes) {
    let ver = 1;
    for (; ver <= 40; ver++) {
      const zaehlBits = ver < 10 ? 8 : 16;
      if (4 + zaehlBits + bytes.length * 8 <= datenCodewoerter(ver) * 8) break;
    }
    if (ver > 40) throw new Error('Text zu lang für einen QR-Code');

    const bits = [];
    const anhaengen = (wert, laenge) => {
      for (let i = laenge - 1; i >= 0; i--) bits.push((wert >>> i) & 1);
    };
    anhaengen(0b0100, 4);
    anhaengen(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach((b) => anhaengen(b, 8));

    const kapazitaet = datenCodewoerter(ver) * 8;
    anhaengen(0, Math.min(4, kapazitaet - bits.length));
    anhaengen(0, (8 - (bits.length % 8)) % 8);
    for (let fuell = 0xec; bits.length < kapazitaet; fuell ^= 0xec ^ 0x11) anhaengen(fuell, 8);

    const worte = [];
    for (let i = 0; i < bits.length; i += 8) {
      worte.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    }
    return { ver, worte };
  }

  // Fehlerkorrektur anfügen und Blöcke verschränken
  function mitKorrektur(ver, daten) {
    const anzahl = BLOECKE[ver];
    const eccLaenge = ECC_JE_BLOCK[ver];
    const gesamt = Math.floor(rohModule(ver) / 8);
    const kurze = anzahl - (gesamt % anzahl);
    const kurzLaenge = Math.floor(gesamt / anzahl);
    const teiler = rsTeiler(eccLaenge);

    const bloecke = [];
    for (let i = 0, k = 0; i < anzahl; i++) {
      const stueck = daten.slice(k, k + kurzLaenge - eccLaenge + (i < kurze ? 0 : 1));
      k += stueck.length;
      const ecc = rsRest(stueck, teiler);
      if (i < kurze) stueck.push(0);
      bloecke.push(stueck.concat(ecc));
    }

    const erg = [];
    for (let i = 0; i < bloecke[0].length; i++) {
      bloecke.forEach((block, j) => {
        if (i !== kurzLaenge - eccLaenge || j >= kurze) erg.push(block[i]);
      });
    }
    return erg;
  }

  /* ------------------------------------------------------------
     4. MATRIX AUFBAUEN
     ------------------------------------------------------------ */
  function matrix(ver, codewoerter) {
    const groesse = ver * 4 + 17;
    const module = Array.from({ length: groesse }, () => new Array(groesse).fill(false));
    const funktion = Array.from({ length: groesse }, () => new Array(groesse).fill(false));
    const setzen = (x, y, dunkel) => {
      module[y][x] = dunkel;
      funktion[y][x] = true;
    };

    // Taktlinien
    for (let i = 0; i < groesse; i++) {
      setzen(6, i, i % 2 === 0);
      setzen(i, 6, i % 2 === 0);
    }

    // Suchmuster in drei Ecken (inkl. heller Rand)
    [[3, 3], [groesse - 4, 3], [3, groesse - 4]].forEach(([x, y]) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= groesse || yy < 0 || yy >= groesse) continue;
          const abstand = Math.max(Math.abs(dx), Math.abs(dy));
          setzen(xx, yy, abstand !== 2 && abstand !== 4);
        }
      }
    });

    // Ausrichtungsmuster
    if (ver > 1) {
      const anzahl = Math.floor(ver / 7) + 2;
      const schritt = Math.floor((ver * 8 + anzahl * 3 + 5) / (anzahl * 4 - 4)) * 2;
      const pos = [6];
      for (let p = groesse - 7; pos.length < anzahl; p -= schritt) pos.splice(1, 0, p);
      const letzte = anzahl - 1;
      for (let i = 0; i < anzahl; i++) {
        for (let j = 0; j < anzahl; j++) {
          if ((i === 0 && j === 0) || (i === 0 && j === letzte) || (i === letzte && j === 0)) continue;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              setzen(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
          }
        }
      }
    }

    // Formatbits (vorläufig reservieren, echte Werte nach der Maskenwahl)
    const formatSetzen = (maske) => {
      const daten = (FORMAT_M << 3) | maske;
      let rest = daten;
      for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
      const bits = ((daten << 10) | rest) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setzen(8, i, bit(bits, i));
      setzen(8, 7, bit(bits, 6));
      setzen(8, 8, bit(bits, 7));
      setzen(7, 8, bit(bits, 8));
      for (let i = 9; i < 15; i++) setzen(14 - i, 8, bit(bits, i));
      for (let i = 0; i < 8; i++) setzen(groesse - 1 - i, 8, bit(bits, i));
      for (let i = 8; i < 15; i++) setzen(8, groesse - 15 + i, bit(bits, i));
      setzen(8, groesse - 8, true); // festes dunkles Modul
    };
    formatSetzen(0);

    // Versionsinformation ab Version 7
    if (ver >= 7) {
      let rest = ver;
      for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
      const bits = (ver << 12) | rest;
      for (let i = 0; i < 18; i++) {
        const a = groesse - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setzen(a, b, bit(bits, i));
        setzen(b, a, bit(bits, i));
      }
    }

    // Daten im Zickzack von rechts unten eintragen
    let i = 0;
    for (let rechts = groesse - 1; rechts >= 1; rechts -= 2) {
      if (rechts === 6) rechts = 5;
      for (let vert = 0; vert < groesse; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = rechts - j;
          const aufwaerts = ((rechts + 1) & 2) === 0;
          const y = aufwaerts ? groesse - 1 - vert : vert;
          if (!funktion[y][x] && i < codewoerter.length * 8) {
            module[y][x] = bit(codewoerter[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }

    return { groesse, module, funktion, formatSetzen };
  }

  function maskeAnwenden(m, maske) {
    for (let y = 0; y < m.groesse; y++) {
      for (let x = 0; x < m.groesse; x++) {
        let umkehren;
        switch (maske) {
          case 0: umkehren = (x + y) % 2 === 0; break;
          case 1: umkehren = y % 2 === 0; break;
          case 2: umkehren = x % 3 === 0; break;
          case 3: umkehren = (x + y) % 3 === 0; break;
          case 4: umkehren = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: umkehren = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: umkehren = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: umkehren = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (umkehren && !m.funktion[y][x]) m.module[y][x] = !m.module[y][x];
      }
    }
  }

  // Strafpunkte nach QR-Norm – je niedriger, desto besser lesbar
  function strafpunkte(m) {
    const n = m.groesse;
    const feld = m.module;
    let punkte = 0;
    const zeile = (y, x) => feld[y][x];
    const spalte = (x, y) => feld[y][x];
    const MUSTER = [true, false, true, true, true, false, true];

    [zeile, spalte].forEach((lesen) => {
      for (let a = 0; a < n; a++) {
        // gleichfarbige Läufe ab 5 Modulen
        let lauf = 1;
        for (let b = 1; b <= n; b++) {
          if (b < n && lesen(a, b) === lesen(a, b - 1)) {
            lauf++;
          } else {
            if (lauf >= 5) punkte += 3 + (lauf - 5);
            lauf = 1;
          }
        }
        // suchmusterähnliche Folgen 1:1:3:1:1 mit 4 hellen Modulen daneben
        for (let b = 0; b + 7 <= n; b++) {
          if (!MUSTER.every((w, k) => lesen(a, b + k) === w)) continue;
          const hellVor = b >= 4 && [1, 2, 3, 4].every((k) => !lesen(a, b - k));
          const hellNach = b + 11 <= n && [7, 8, 9, 10].every((k) => !lesen(a, b + k));
          if (hellVor || hellNach) punkte += 40;
        }
      }
    });

    // 2×2-Blöcke gleicher Farbe
    let dunkel = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (feld[y][x]) dunkel++;
        if (x < n - 1 && y < n - 1) {
          const f = feld[y][x];
          if (f === feld[y][x + 1] && f === feld[y + 1][x] && f === feld[y + 1][x + 1]) punkte += 3;
        }
      }
    }

    // Verhältnis hell/dunkel
    punkte += Math.floor(Math.abs(dunkel * 20 - n * n * 10) / (n * n)) * 10;
    return punkte;
  }

  /* ------------------------------------------------------------
     5. ÖFFENTLICHE FUNKTIONEN
     ------------------------------------------------------------ */
  // Liefert die Modul-Matrix (true = dunkel) – auch für Tests
  function qrMatrix(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    const { ver, worte } = kodieren(bytes);
    const codewoerter = mitKorrektur(ver, worte);

    let beste = null;
    let bestePunkte = Infinity;
    for (let maske = 0; maske < 8; maske++) {
      const m = matrix(ver, codewoerter);
      maskeAnwenden(m, maske);
      m.formatSetzen(maske);
      const p = strafpunkte(m);
      if (p < bestePunkte) {
        bestePunkte = p;
        beste = m;
      }
    }
    return beste.module;
  }

  function svg(text, { titel = 'QR-Code' } = {}) {
    const module = qrMatrix(text);
    const rand = 4; // vorgeschriebene Ruhezone
    const breite = module.length + rand * 2;
    let pfad = '';
    module.forEach((reihe, y) => reihe.forEach((dunkel, x) => {
      if (dunkel) pfad += `M${x + rand} ${y + rand}h1v1h-1z`;
    }));
    const titelSicher = String(titel).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Feste Farben schwarz/weiß: Kontrast ist für das Scannen entscheidend
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${breite} ${breite}" role="img" shape-rendering="crispEdges"><title>${titelSicher}</title><rect width="${breite}" height="${breite}" fill="#fff"/><path d="${pfad}" fill="#000"/></svg>`;
  }

  // Inhalt nach EPC069-12, Version 002 (BIC darf leer sein)
  function epcText({ name, iban, bic = '', betragCent, zweck = '' }) {
    const ibanRein = String(iban || '').replace(/\s+/g, '').toUpperCase();
    const nameRein = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    if (!ibanRein || !nameRein) throw new Error('Name und IBAN sind nötig');
    if (!Number.isInteger(betragCent) || betragCent < 1 || betragCent > 99999999999) {
      throw new Error('Ungültiger Betrag');
    }
    const betrag = `EUR${Math.floor(betragCent / 100)}.${String(betragCent % 100).padStart(2, '0')}`;
    return [
      'BCD', '002', '1', 'SCT',
      String(bic || '').replace(/\s+/g, '').toUpperCase(),
      nameRein,
      ibanRein,
      betrag,
      '', // Zweckcode
      '', // strukturierte Referenz
      String(zweck || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    ].join('\n');
  }

  globalThis.KruckenhausQr = { svg, epcText, qrMatrix };
})();
