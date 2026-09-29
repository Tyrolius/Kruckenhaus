/* ============================================================
 * VERFÜGBARKEITSKALENDER – Ferienwohnung Kruckenhaus
 * ============================================================
 * Lädt die belegten Zeiträume von der Cloudflare Pages Function
 * (/api/availability, gespeist aus dem Airbnb-iCal-Export) und
 * rendert einen Monatskalender: belegte Nächte durchgestrichen,
 * freie grün.
 *
 * Steht auf derselben Seite ein Anfrageformular mit den Feldern
 * #anreise und #abreise (Buchungsbereich auf preise.html), wird der
 * Kalender auswählbar: erster Klick = Anreise, zweiter Klick = Abreise.
 * Die Daten landen direkt im Formular – und umgekehrt markiert der
 * Kalender Daten, die jemand von Hand ins Formular tippt.
 *
 * Kein Framework, keine Abhängigkeiten – passend zum Rest der Seite.
 * ============================================================ */

(function () {
  'use strict';

  const container = document.querySelector('#verfuegbarkeits-kalender');
  if (!container) return;

  const MONTH_NAMES = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const MONTHS_AHEAD = 12; // wie weit in die Zukunft geblättert werden kann

  // Auswahlmodus nur, wenn das Formular auf derselben Seite steht
  const anreiseFeld = document.querySelector('#contact-form #anreise');
  const abreiseFeld = document.querySelector('#contact-form #abreise');
  const auswahlModus = Boolean(anreiseFeld && abreiseFeld);
  const statusEl = document.querySelector('#kalender-auswahl');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Aktuell angezeigter Monat (erster der beiden Spalten)
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();

  /** Menge aller belegten Nächte als "YYYY-MM-DD" (DTEND ist exklusiv). */
  const bookedNights = new Set();

  /** Aktuelle Auswahl als "YYYY-MM-DD" oder null. */
  let anreise = null;
  let abreise = null;

  function toKey(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  function fromKey(key) {
    return new Date(key + 'T00:00:00');
  }

  function langesDatum(key) {
    const d = fromKey(key);
    return DAY_NAMES[d.getDay()] + ', ' + d.getDate() + '. ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function kurzesDatum(key) {
    const d = fromKey(key);
    return d.getDate() + '. ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function naechte(von, bis) {
    return Math.round((fromKey(bis) - fromKey(von)) / 86400000);
  }

  function addBusyRange(startStr, endStr) {
    const start = fromKey(startStr);
    const end = fromKey(endStr); // exklusiv (Abreisetag)
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      bookedNights.add(toKey(d));
    }
  }

  /** Sind alle Nächte von (inkl.) bis (exkl.) frei? */
  function zeitraumFrei(von, bis) {
    for (let d = fromKey(von); d < fromKey(bis); d.setDate(d.getDate() + 1)) {
      if (bookedNights.has(toKey(d))) return false;
    }
    return true;
  }

  function monthDiff(y, m) {
    return (y - today.getFullYear()) * 12 + (m - today.getMonth());
  }

  /* ----------------------------------------------------------
     Status-Zeile (wird von Screenreadern angesagt)
     ---------------------------------------------------------- */
  function setzeStatus(text, istFehler) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('kalender-auswahl--fehler', Boolean(istFehler));
  }

  function statusFuerAuswahl() {
    if (anreise && abreise) {
      const n = naechte(anreise, abreise);
      setzeStatus('Gewählt: ' + kurzesDatum(anreise) + ' bis ' + kurzesDatum(abreise) +
        ' · ' + n + (n === 1 ? ' Nacht' : ' Nächte') + '. Die Daten stehen jetzt im Formular.');
    } else if (anreise) {
      setzeStatus('Anreise: ' + langesDatum(anreise) + '. Jetzt den Abreisetag antippen.');
    } else {
      setzeStatus('Tippt im Kalender zuerst auf den Anreisetag, dann auf den Abreisetag.');
    }
  }

  /* ----------------------------------------------------------
     Auswahl
     ---------------------------------------------------------- */
  function uebernimmInsFormular() {
    if (!auswahlModus) return;
    anreiseFeld.value = anreise || '';
    abreiseFeld.value = abreise || '';
  }

  function tagGewaehlt(key) {
    if (bookedNights.has(key) && !(anreise && !abreise && key > anreise)) {
      // Anreise auf eine belegte Nacht geht nicht (Abreise schon – dann ist die Nacht davor maßgeblich)
      setzeStatus(langesDatum(key) + ' ist leider schon belegt. Bitte einen anderen Tag wählen.', true);
      return;
    }

    if (!anreise || abreise || key <= anreise) {
      // Neue Auswahl beginnen
      anreise = key;
      abreise = null;
    } else if (zeitraumFrei(anreise, key)) {
      abreise = key;
    } else {
      setzeStatus('Zwischen ' + kurzesDatum(anreise) + ' und ' + kurzesDatum(key) +
        ' ist schon etwas belegt. Bitte einen kürzeren Zeitraum oder eine andere Anreise wählen.', true);
      return;
    }
    uebernimmInsFormular();
    render();
    statusFuerAuswahl();
    // Fokus auf dem gewählten Tag halten (Tastaturbedienung)
    const btn = container.querySelector('[data-tag="' + key + '"]');
    if (btn) btn.focus();
  }

  // Von Hand ins Formular getippte Daten im Kalender markieren
  if (auswahlModus) {
    [anreiseFeld, abreiseFeld].forEach(function (feld) {
      feld.addEventListener('change', function () {
        anreise = anreiseFeld.value || null;
        abreise = abreiseFeld.value && anreise && abreiseFeld.value > anreise ? abreiseFeld.value : null;
        if (anreise) {
          const d = fromKey(anreise);
          if (monthDiff(d.getFullYear(), d.getMonth()) >= 0 && monthDiff(d.getFullYear(), d.getMonth()) < MONTHS_AHEAD) {
            viewYear = d.getFullYear();
            viewMonth = d.getMonth();
          }
        }
        if (container.querySelector('.cal-months')) render();
        if (anreise && abreise && !zeitraumFrei(anreise, abreise)) {
          setzeStatus('Achtung: Im gewählten Zeitraum ist laut Kalender schon etwas belegt.', true);
        } else {
          statusFuerAuswahl();
        }
      });
    });
  }

  /* ----------------------------------------------------------
     Darstellung
     ---------------------------------------------------------- */
  function renderMonth(year, month) {
    const first = new Date(year, month, 1);
    // getDay(): So=0 … Sa=6 → Montag-basiert umrechnen
    const lead = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="cal-day cal-day--empty"></span>';

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const key = toKey(date);
      const name = DAY_NAMES[date.getDay()] + ', ' + day + '. ' + MONTH_NAMES[month] + ' ' + year;

      if (date < today) {
        cells += '<span class="cal-day cal-day--past" aria-hidden="true">' + day + '</span>';
        continue;
      }

      const belegt = bookedNights.has(key);
      let cls = 'cal-day ' + (belegt ? 'cal-day--booked' : 'cal-day--free');
      let zusatz = '';
      if (anreise && key === anreise) { cls += ' cal-day--anreise'; zusatz = ', gewählte Anreise'; }
      if (abreise && key === abreise) { cls += ' cal-day--abreise'; zusatz = ', gewählte Abreise'; }
      if (anreise && abreise && key > anreise && key < abreise) cls += ' cal-day--zwischen';
      const label = name + (belegt ? ', belegt' : ', frei') + zusatz;

      if (auswahlModus) {
        const gedrueckt = (key === anreise || key === abreise) ? 'true' : 'false';
        cells += '<button type="button" class="' + cls + '" data-tag="' + key + '" aria-label="' + label +
          '" aria-pressed="' + gedrueckt + '">' + day + '</button>';
      } else {
        cells += '<span class="' + cls + '" role="img" aria-label="' + label + '">' + day + '</span>';
      }
    }

    return (
      '<div class="cal-month">' +
        '<div class="cal-month-title">' + MONTH_NAMES[month] + ' ' + year + '</div>' +
        '<div class="cal-grid cal-grid--head" aria-hidden="true">' +
          WEEKDAYS.map(function (w) { return '<span class="cal-weekday">' + w + '</span>'; }).join('') +
        '</div>' +
        '<div class="cal-grid">' + cells + '</div>' +
      '</div>'
    );
  }

  function render() {
    const second = new Date(viewYear, viewMonth + 1, 1);
    const atStart = monthDiff(viewYear, viewMonth) <= 0;
    const atEnd = monthDiff(viewYear, viewMonth) >= MONTHS_AHEAD - 1;

    container.innerHTML =
      '<div class="cal-nav">' +
        '<button type="button" class="cal-nav-btn" data-dir="-1" aria-label="Vorheriger Monat"' + (atStart ? ' disabled' : '') + '>&#8249;</button>' +
        '<span class="cal-nav-label">' + MONTH_NAMES[viewMonth] + ' – ' + MONTH_NAMES[second.getMonth()] + ' ' + second.getFullYear() + '</span>' +
        '<button type="button" class="cal-nav-btn" data-dir="1" aria-label="N&auml;chster Monat"' + (atEnd ? ' disabled' : '') + '>&#8250;</button>' +
      '</div>' +
      '<div class="cal-months">' +
        renderMonth(viewYear, viewMonth) +
        renderMonth(second.getFullYear(), second.getMonth()) +
      '</div>' +
      '<div class="cal-legend">' +
        '<span class="cal-legend-item"><span class="cal-dot cal-dot--free"></span> frei</span>' +
        '<span class="cal-legend-item"><span class="cal-dot cal-dot--booked"></span> belegt</span>' +
        (auswahlModus ? '<span class="cal-legend-item"><span class="cal-dot cal-dot--gewaehlt"></span> eure Auswahl</span>' : '') +
      '</div>' +
      '<p class="cal-hint">Der Kalender wird automatisch mit unserem Airbnb-Kalender abgeglichen. ' +
      'Kurzfristige &Auml;nderungen vorbehalten &ndash; verbindlich wird eure Buchung erst mit unserer Best&auml;tigung.</p>';

    container.querySelectorAll('.cal-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const next = new Date(viewYear, viewMonth + Number(btn.dataset.dir), 1);
        viewYear = next.getFullYear();
        viewMonth = next.getMonth();
        render();
        const gleicherBtn = container.querySelector('.cal-nav-btn[data-dir="' + btn.dataset.dir + '"]');
        if (gleicherBtn && !gleicherBtn.disabled) gleicherBtn.focus();
      });
    });

    if (auswahlModus) {
      container.querySelectorAll('button[data-tag]').forEach(function (btn) {
        btn.addEventListener('click', function () { tagGewaehlt(btn.dataset.tag); });
      });
    }
  }

  function showFallback(message) {
    container.innerHTML = '<p class="cal-fallback">' + message + '</p>';
    if (auswahlModus) setzeStatus('Tragt euren Wunschtermin einfach direkt im Formular ein.');
  }

  container.innerHTML = '<p class="cal-fallback">Kalender wird geladen &hellip;</p>';

  const hinweisOhneKalender = auswahlModus
    ? 'Den aktuellen Belegungsstand prüfen wir gerne für euch &ndash; tragt euren Wunschtermin einfach unten ein.'
    : 'Den aktuellen Belegungsstand nennen wir euch gerne auf Anfrage.';

  fetch('/api/availability')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data.configured) {
        showFallback(hinweisOhneKalender);
        return;
      }
      if (data.error) throw new Error(data.error);
      (data.busy || []).forEach(function (r) { addBusyRange(r.start, r.end); });
      render();
      if (auswahlModus) statusFuerAuswahl();
    })
    .catch(function () {
      showFallback('Der Kalender kann gerade nicht geladen werden. ' + hinweisOhneKalender);
    });
})();
