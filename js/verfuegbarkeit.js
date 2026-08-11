/* ============================================================
 * VERFÜGBARKEITSKALENDER – Ferienwohnung Kruckenhaus
 * ============================================================
 * Lädt die belegten Zeiträume von der Cloudflare Pages Function
 * (/api/availability, gespeist aus dem Airbnb-iCal-Export) und
 * rendert einen Monatskalender: belegte Nächte grau, freie grün.
 *
 * Kein Framework, keine Abhängigkeiten – passend zum Rest der Seite.
 * ============================================================ */

(function () {
  'use strict';

  const container = document.querySelector('#verfuegbarkeits-kalender');
  if (!container) return;

  const MONTH_NAMES = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const MONTHS_AHEAD = 12; // wie weit in die Zukunft geblättert werden kann

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Aktuell angezeigter Monat (erster der beiden Spalten)
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();

  /** Menge aller belegten Nächte als "YYYY-MM-DD" (DTEND ist exklusiv). */
  const bookedNights = new Set();

  function toKey(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  function addBusyRange(startStr, endStr) {
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00'); // exklusiv (Abreisetag)
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      bookedNights.add(toKey(d));
    }
  }

  function monthDiff(y, m) {
    return (y - today.getFullYear()) * 12 + (m - today.getMonth());
  }

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
      let cls = 'cal-day';
      let label = '';
      if (date < today) {
        cls += ' cal-day--past';
      } else if (bookedNights.has(key)) {
        cls += ' cal-day--booked';
        label = ' aria-label="' + day + '. belegt"';
      } else {
        cls += ' cal-day--free';
        label = ' aria-label="' + day + '. frei"';
      }
      cells += '<span class="' + cls + '"' + label + '>' + day + '</span>';
    }

    return (
      '<div class="cal-month">' +
        '<div class="cal-month-title">' + MONTH_NAMES[month] + ' ' + year + '</div>' +
        '<div class="cal-grid cal-grid--head">' +
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
        '<span class="cal-nav-label">Verf&uuml;gbarkeit</span>' +
        '<button type="button" class="cal-nav-btn" data-dir="1" aria-label="N&auml;chster Monat"' + (atEnd ? ' disabled' : '') + '>&#8250;</button>' +
      '</div>' +
      '<div class="cal-months">' +
        renderMonth(viewYear, viewMonth) +
        renderMonth(second.getFullYear(), second.getMonth()) +
      '</div>' +
      '<div class="cal-legend">' +
        '<span class="cal-legend-item"><span class="cal-dot cal-dot--free"></span> frei</span>' +
        '<span class="cal-legend-item"><span class="cal-dot cal-dot--booked"></span> belegt</span>' +
      '</div>' +
      '<p class="cal-hint">Der Kalender wird automatisch mit unserem Airbnb-Kalender abgeglichen. ' +
      'Kurzfristige &Auml;nderungen vorbehalten &ndash; verbindlich wird eure Buchung erst mit unserer Best&auml;tigung.</p>';

    container.querySelectorAll('.cal-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const next = new Date(viewYear, viewMonth + Number(btn.dataset.dir), 1);
        viewYear = next.getFullYear();
        viewMonth = next.getMonth();
        render();
      });
    });
  }

  function showFallback(message) {
    container.innerHTML = '<p class="cal-fallback">' + message + '</p>';
  }

  container.innerHTML = '<p class="cal-fallback">Kalender wird geladen &hellip;</p>';

  fetch('/api/availability')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data.configured) {
        showFallback('Den aktuellen Belegungsstand nennen wir euch gerne auf Anfrage &ndash; einfach unten Kontakt aufnehmen.');
        return;
      }
      if (data.error) throw new Error(data.error);
      (data.busy || []).forEach(function (r) { addBusyRange(r.start, r.end); });
      render();
    })
    .catch(function () {
      showFallback('Der Kalender kann gerade nicht geladen werden. Fragt die Verf&uuml;gbarkeit einfach unten direkt bei uns an.');
    });
})();
