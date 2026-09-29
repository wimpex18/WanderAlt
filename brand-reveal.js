/* Pre-paint eligibility; CSS owns the one-second sequence. */
(() => {
  const key = 'wa:brand-reveal:v1';
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (_) { return; } // Storage unavailable: go straight to the page.

  const root = document.documentElement;
  const finish = () => {
    delete root.dataset.brandReveal;
    document.querySelector('.wa-brand-reveal')?.remove();
    document.removeEventListener('animationend', onEnd);
  };
  const onEnd = (event) => {
    if (event.animationName === 'wa-brand-reveal-out') finish();
  };
  root.dataset.brandReveal = '';
  document.addEventListener('animationend', onEnd);
  document.addEventListener('DOMContentLoaded', () => {
    // Also clears the overlay if animations are disabled or interrupted.
    setTimeout(finish, 1200);
  }, { once: true });
})();
