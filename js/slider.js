/**
 * KRUCKENHAUS – Hero Slider
 * Automatisch wechselnd (5 Sek.), manuell steuerbar, Touch-Swipe auf Mobile
 */

'use strict';

(function () {
  const INTERVAL = 5000;

  const slidesWrapper = document.getElementById('heroSlides');
  if (!slidesWrapper) return;

  const slides = Array.from(slidesWrapper.querySelectorAll('.hero-slide'));
  const dots   = Array.from(document.querySelectorAll('.slider-dot'));
  const prevBtn = document.getElementById('sliderPrev');
  const nextBtn = document.getElementById('sliderNext');

  if (!slides.length) return;

  let current = 0;
  let timer   = null;
  let touchStartX = 0;

  function goTo(index) {
    slides[current].classList.remove('active');
    dots[current]?.classList.remove('active');
    dots[current]?.setAttribute('aria-selected', 'false');

    current = (index + slides.length) % slides.length;

    slides[current].classList.add('active');
    dots[current]?.classList.add('active');
    dots[current]?.setAttribute('aria-selected', 'true');

    slidesWrapper.style.transform = `translateX(-${current * 100}%)`;
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function startTimer() {
    stopTimer();
    timer = setInterval(next, INTERVAL);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // Autoplay
  startTimer();

  // Arrow buttons
  if (prevBtn) {
    prevBtn.addEventListener('click', () => { prev(); startTimer(); });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => { next(); startTimer(); });
  }

  // Dot navigation
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => { goTo(i); startTimer(); });
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  { prev(); startTimer(); }
    if (e.key === 'ArrowRight') { next(); startTimer(); }
  });

  // Touch swipe
  slidesWrapper.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });

  slidesWrapper.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? next() : prev();
      startTimer();
    }
  }, { passive: true });

  // Pause on hover
  const heroSection = slidesWrapper.closest('.hero-slider');
  if (heroSection) {
    heroSection.addEventListener('mouseenter', stopTimer);
    heroSection.addEventListener('mouseleave', startTimer);
  }

  // Pause when tab is hidden (performance)
  document.addEventListener('visibilitychange', () => {
    document.hidden ? stopTimer() : startTimer();
  });

})();
