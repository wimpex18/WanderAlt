/* ============================================================
   design-check.js — does the build render what the handoff draws?
   ------------------------------------------------------------
   Companion to design-spec.js. That one extracts every string the
   direction DRAWS, per section; this one is pasted into the browser
   console (or run through the Claude Code browser pane) on a given
   page and reports which of those strings actually reach the DOM.

   Run it per page, naming the sections that page is supposed to
   satisfy:

     await waDesignCheck(['5a', '5b'])        // on index.html
     await waDesignCheck(['5d', '2a', '2b'])  // on discover.html

   It reports three buckets:

     present  — the string is in the DOM
     absent   — the string is NOT in the DOM. Every one of these needs
                an answer: built differently, superseded by a later
                round, or genuinely missing. Silence is what let four
                gaps ship.
     sample   — looks like the designer's placeholder catalogue (venue
                names, prices), so absence is expected.

   Deliberately dumb: it checks text, not layout, colour or spacing.
   Those still need measuring. What it buys is that nothing DRAWN can
   go missing without showing up in a list.

   Not a test framework and not wired to CI — there is no CI. It is a
   checklist you can re-run, which is the thing that was missing.
   ============================================================ */
(() => {
  const SAMPLE = /^(Uus Laine|Turntable|EYEHATEGOD|Drew McDowall|Napalm|Köögi|Võta|Sveta|Sigmund|Puänt|Paavli|Kopli|Telliskivi|Kalamaja|Vanalinn|Põhja-Tallinn|Cabaret|Film Club|Alcarràs|Childbeater|HUKK|Robert Nikolajev|Rat Chat|Riga in October|Kanuti)/i;

  /* Wait for the page to have actually rendered. Every screen here is
     built from a fetch, so checking too early reports the whole shelf
     absent — a false negative, which is worse than no check at all: it
     trains you to skim the output. Settles when the DOM stops growing. */
  const settled = async (quietMs = 700, capMs = 8000) => {
    const t0 = Date.now();
    let last = -1, lastChange = Date.now();
    while (Date.now() - t0 < capMs) {
      const n = document.querySelectorAll('*').length;
      if (n !== last) { last = n; lastChange = Date.now(); }
      else if (Date.now() - lastChange > quietMs) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  };

  window.waDesignCheck = async (ids) => {
    const spec = await (await fetch('/design-spec.json', { cache: 'no-store' })).json();
    const rendered = await settled();
    const body = (document.body.innerText || '').replace(/\s+/g, ' ');
    if (!rendered) console.warn('[design-check] DOM never settled — results may under-report.');
    const norm = (s) => s.replace(/\s+/g, ' ').trim();

    const report = {};
    for (const id of ids) {
      const sec = spec.sections.find(s => s.id === id);
      if (!sec) { report[id] = { error: 'no such section in spec' }; continue; }
      const present = [], absent = [], sample = [];
      for (const label of sec.labels) {
        const l = norm(label);
        if (body.toLowerCase().includes(l.toLowerCase())) present.push(l);
        else if (SAMPLE.test(l)) sample.push(l);
        else absent.push(l);
      }
      report[id] = {
        title: sec.title,
        score: `${present.length}/${present.length + absent.length}`,
        absent,
        sampleSkipped: sample.length,
      };
    }
    return report;
  };

  return 'waDesignCheck(ids) ready';
})();
