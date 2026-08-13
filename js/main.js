/**
 * KRUCKENHAUS – Haupt-JavaScript
 * Ferienwohnung Breitenbach am Inn, Tirol
 * Vanilla JS, kein Framework
 */

'use strict';

/* ============================================================
   1. DOM READY
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initHamburger();
  initSmoothScroll();
  initBackToTop();
  initLightbox();
  setActiveNavLink();
  initBottomTabBar();
  initTimeline();
});

/* ============================================================
   2. HEADER – Scroll-Effekt
   ============================================================ */
function initHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const handleScroll = () => {
    if (window.scrollY > 60) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  // Initialer Check (z. B. nach Page-Reload mit Scroll-Position)
  handleScroll();
}

/* ============================================================
   3. HAMBURGER MENU (Mobile)
   ============================================================ */
function initHamburger() {
  const hamburger = document.querySelector('.hamburger');
  const overlay   = document.querySelector('.nav-overlay');
  const body      = document.body;

  if (!hamburger || !overlay) return;

  const toggleMenu = (open) => {
    hamburger.classList.toggle('open', open);
    overlay.classList.toggle('open', open);
    body.style.overflow = open ? 'hidden' : '';
    hamburger.setAttribute('aria-expanded', String(open));
  };

  hamburger.addEventListener('click', () => {
    const isOpen = overlay.classList.contains('open');
    toggleMenu(!isOpen);
  });

  // Schließen wenn ein Overlay-Link geklickt wird
  overlay.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => toggleMenu(false));
  });

  // Schließen bei ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      toggleMenu(false);
    }
  });
}

/* ============================================================
   4. SMOOTH SCROLL
   ============================================================ */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();
      const headerHeight = parseInt(
        getComputedStyle(document.documentElement)
          .getPropertyValue('--header-height')
      ) || 70;

      window.scrollTo({
        top: target.offsetTop - headerHeight,
        behavior: 'smooth'
      });
    });
  });
}

/* ============================================================
   5. SCROLL-ANIMATIONEN
   Reveal läuft jetzt JS-frei über CSS Scroll-driven Animations
   (animation-timeline: view()) in css/style.css. Kein IntersectionObserver
   mehr nötig; Browser ohne Support zeigen den Inhalt einfach sofort.
   ============================================================ */

/* ============================================================
   6. BACK-TO-TOP BUTTON
   ============================================================ */
function initBackToTop() {
  const btn = document.querySelector('.back-to-top');
  if (!btn) return;

  const THRESHOLD = 300;

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > THRESHOLD);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ============================================================
   7. LIGHTBOX (Galerie)
   ============================================================ */
function initLightbox() {
  const lightbox    = document.querySelector('.lightbox');
  const lightboxImg = document.querySelector('.lightbox-img');
  const closeBtn    = document.querySelector('.lightbox-close');
  const caption     = document.querySelector('.lightbox-caption');

  if (!lightbox) return;

  const galleryItems = document.querySelectorAll('.gallery-item[data-src]');

  const openLightbox = (src, alt) => {
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    if (caption) caption.textContent = alt || '';
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    closeBtn?.focus();
  };

  const closeLightbox = () => {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    lightboxImg.src = '';
  };

  galleryItems.forEach(item => {
    item.addEventListener('click', () => {
      const src = item.dataset.src;
      const alt = item.dataset.alt || item.querySelector('img')?.alt || '';
      openLightbox(src, alt);
    });

    // Tastatur-Zugänglichkeit
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closeLightbox);
  }

  // Klick außerhalb schließt Lightbox
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  // ESC schließt
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('open')) {
      closeLightbox();
    }
  });
}

/* ============================================================
   8. AKTIVER NAV-LINK (aktuelle Seite)
   ============================================================ */
function setActiveNavLink() {
  const path = window.location.pathname;
  const filename = path.split('/').pop() || 'index.html';

  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;

    const linkFile = href.split('/').pop();

    if (
      linkFile === filename ||
      (filename === '' && linkFile === 'index.html') ||
      (filename === 'index.html' && (linkFile === 'index.html' || linkFile === ''))
    ) {
      link.classList.add('active');
    }
  });
}

/* ============================================================
   9. KONTAKTFORMULAR – Client-side Validierung
   ============================================================ */
const contactForm = document.querySelector('#contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name    = contactForm.querySelector('#name')?.value.trim();
    const email   = contactForm.querySelector('#email')?.value.trim();
    const message = contactForm.querySelector('#message')?.value.trim();
    const anreise = contactForm.querySelector('#anreise')?.value;
    const abreise = contactForm.querySelector('#abreise')?.value;

    if (!name || !email || !message) {
      showFormMessage('Bitte füllen Sie alle Pflichtfelder aus.', 'error');
      return;
    }

    if (!isValidEmail(email)) {
      showFormMessage('Bitte geben Sie eine gültige E-Mail-Adresse ein.', 'error');
      return;
    }

    if (message.length < 10) {
      showFormMessage('Bitte beschreiben Sie Ihr Anliegen etwas ausführlicher (mind. 10 Zeichen).', 'error');
      return;
    }

    if (anreise && abreise && abreise <= anreise) {
      showFormMessage('Die Abreise muss nach der Anreise liegen.', 'error');
      return;
    }

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalLabel = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Wird gesendet …';
    }

    // Anfrage an die Cloudflare Pages Function senden (AJAX, ohne Seiten-Reload)
    fetch('/api/kontakt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(contactForm).entries()))
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error || 'Netzwerkfehler');
        showFormMessage(
          'Vielen Dank für Ihre Nachricht! Wir melden uns innerhalb von 24 Stunden.',
          'success'
        );
        contactForm.reset();
      })
      .catch(() => {
        showFormMessage(
          'Das Senden hat leider nicht funktioniert. Bitte schreiben Sie uns direkt an info@kruckenhaus.at oder rufen Sie an.',
          'error'
        );
      })
      .finally(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        }
      });
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showFormMessage(text, type) {
  const existing = document.querySelector('.form-message');
  if (existing) existing.remove();

  const msg = document.createElement('div');
  msg.className = `form-message form-message--${type}`;
  msg.textContent = text;
  msg.style.cssText = `
    padding: 0.85rem 1rem;
    border-radius: 8px;
    margin-top: 1rem;
    font-weight: 700;
    font-size: 0.9rem;
    background-color: ${type === 'success' ? '#e8f5e9' : '#fdecea'};
    color: ${type === 'success' ? '#2e7d32' : '#c62828'};
    border-left: 4px solid ${type === 'success' ? '#4caf50' : '#ef5350'};
  `;

  contactForm.appendChild(msg);

  setTimeout(() => msg.remove(), 6000);
}

/* ============================================================
   10. BOTTOM TAB BAR (Mobile, hide on scroll down, show on scroll up)
   ============================================================ */
function initBottomTabBar() {
  const tabBar = document.getElementById('bottomTabBar');
  if (!tabBar) return;

  let lastScrollY = window.scrollY;
  let ticking = false;

  const updateTabBar = () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      tabBar.classList.add('hidden');
    } else {
      tabBar.classList.remove('hidden');
    }
    lastScrollY = currentScrollY;
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateTabBar);
      ticking = true;
    }
  }, { passive: true });

  // Set active tab based on current page
  const path = window.location.pathname;
  const filename = path.split('/').pop() || 'index.html';
  tabBar.querySelectorAll('.bottom-tab-item').forEach(item => {
    const href = item.getAttribute('href');
    if (href && href.split('/').pop() === filename) {
      item.classList.add('active');
    }
  });
}

/* ============================================================
   11. TIMELINE – Scroll-triggered Animation
   ============================================================ */
function initTimeline() {
  const items = document.querySelectorAll('.timeline-item');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach(item => item.classList.add('animate'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -30px 0px' }
  );

  items.forEach(item => observer.observe(item));
}

/* ============================================================
   12. SAISONALE BILDER – Vorbereitung
   ============================================================ */
/**
 * Setzt die Jahreszeit-Klasse am Body.
 * Aufruf: setSeason('winter') oder setSeason('summer')
 * Standardmäßig wird die aktuelle Jahreszeit erkannt.
 */
function setSeason(override) {
  const month  = new Date().getMonth(); // 0 = Jan
  const season = override || (month >= 10 || month <= 2 ? 'winter' : 'summer');
  document.body.classList.remove('season-winter', 'season-summer');
  document.body.classList.add(`season-${season}`);
}

// Automatisch beim Laden die Saison setzen
setSeason();
