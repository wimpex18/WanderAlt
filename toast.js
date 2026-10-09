/* ============================================================
   toast.js — WA.Toast.
   ------------------------------------------------------------
   One toast at a time, above the tab bar, ~6s, always with the reverse
   action. Enforced here: the undo action is a required argument.
   It waits while a pointer or focus is on it. Screen readers hear it
   through one status region that is already in the page, so the message
   is announced as a change rather than missed as new markup.
   ============================================================ */
window.WA = window.WA || {};

window.WA.Toast = (() => {
  'use strict';

  const LIFE = 6000;
  let node = null;
  let timer = null;
  let region = null;
  const say = (text) => {
    if (!region) {
      region = document.createElement('div');
      region.className = 'wa-sr';
      region.setAttribute('role', 'status');
      document.body.appendChild(region);
    }
    region.textContent = '';
    requestAnimationFrame(() => { region.textContent = text; });
  };

  const dismiss = () => {
    clearTimeout(timer);
    if (node) { node.remove(); node = null; }
  };

  /* show(message, undoLabel, onUndo)
     onUndo is required. A toast with nothing to undo is a notification,
     and this product does not have those. */
  const show = (message, undoLabel, onUndo) => {
    if (typeof onUndo !== 'function') {
      console.warn('[WA.Toast] refused: every toast needs a reverse action.');
      return;
    }
    dismiss();                       /* one at a time, always */

    node = document.createElement('div');
    node.className = 'wa-toast';

    const text = document.createElement('span');
    text.className = 'wa-toast__text';
    text.textContent = String(message == null ? '' : message);

    const btn = document.createElement('button');
    btn.className = 'wa-toast__undo';
    btn.type = 'button';
    btn.textContent = String(undoLabel || 'Undo');
    btn.addEventListener('click', () => {
      try { onUndo(); } finally { dismiss(); }
    });

    node.append(text, btn);
    document.body.appendChild(node);
    say(text.textContent);
    const wait = () => clearTimeout(timer);
    const go = () => { clearTimeout(timer); timer = setTimeout(dismiss, LIFE); };
    node.addEventListener('pointerenter', wait);
    node.addEventListener('pointerleave', go);
    node.addEventListener('focusin', wait);
    node.addEventListener('focusout', go);
    go();
  };

  return { show, dismiss };
})();
