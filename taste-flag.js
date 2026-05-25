/* Anti-CLS, pre-paint: if the visitor already did taste onboarding, hide
   the taste banner before first paint so it never reserves space (no
   layout shift). Externalised from an inline <script> so the strict CSP
   (script-src 'self', no 'unsafe-inline') allows it. Loaded NON-defer in
   <head> on index.html so it runs before the body renders. Mirrors
   taste.js isOnboarded(). */
try {
  if (localStorage.getItem('wa-taste-onboarded') === '1') {
    document.documentElement.classList.add('wa-taste-done');
  }
} catch (e) { /* storage blocked — banner just shows, no harm */ }
