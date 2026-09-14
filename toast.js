/* ============================================================
   toast.js — WA.Toast.
   ------------------------------------------------------------
   One toast at a time, above the tab bar, ~4s, always with the reverse
   action. Enforced here: the undo action is a required argument.
   ============================================================ */
window.WA = window.WA || {};

window.WA.Toast = (() => {
  'use strict';

  const LIFE = 4000;
  let node = null;
  let timer = null;

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
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');

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
    timer = setTimeout(dismiss, LIFE);
  };

  return { show, dismiss };
})();
