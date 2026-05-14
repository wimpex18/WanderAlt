/* ============================================================
   WanderAlt — content catalog
   ------------------------------------------------------------
   Single source of truth for every venue and event.
   Load this before any page script on all pages.

   Entry shape:
     id            – stable slug; doubles as localStorage bookmark key
     title         – display title (event name or venue name)
     venue         – venue / place name (may equal title for permanent places)
     neighborhood  – Tallinn district
     kind          – gig | talk | exhibition | club | place | bookshop |
                     record store | gallery | thrift | lecture | noise
     day           – "Tonight" | "Mon"…"Sun" | null (permanent places)
     time          – "22:00" | "open daily" | "Wed–Sun" | "ongoing" | null
     quote         – curator's line, no em-dash; rendering context adds it
     handle        – curator handle (with or without @)
     thumbInitials – two-letter fallback for the thumbnail placeholder
     tonight       – true  → Tonight hero on Briefing
     thisWeek      – true  → This Week list on Briefing
     moodTags      – subset of the 10 editorial mood vocabulary:
                     quiet · loud · indoors · outdoors · solo · social ·
                     drinks · sober · walk-up · ticketed
     pin           – { num, left, top, eyebrow } | null
   ============================================================ */
window.WA = window.WA || {};

window.WA.catalog = [

  /* ── Tonight hero ─────────────────────────────────────────── */
  {
    id:            'ethics-of-failure',
    title:         'On the ethics of failure — a lecture',
    venue:         'Fotografiska',
    neighborhood:  'Vanalinn',
    kind:          'talk',
    day:           'Tonight',
    time:          '19:00',
    quote:         "That sharp essayist's brain.",
    handle:        '@raul.reads',
    thumbInitials: 'OE',
    tonight:       true,
    thisWeek:      false,
    moodTags:      ['quiet', 'indoors', 'solo', 'ticketed'],
    pin:           { num: 1, left: '58%', top: '30%', eyebrow: 'Tonight' },
    world_x: 1060, world_y: 510
  },

  /* ── This week ────────────────────────────────────────────── */
  {
    id:            'estonia-georgia-tape-split',
    title:         'Estonia–Georgia tape split, live',
    venue:         'Paavli Kultuurivabrik',
    neighborhood:  'Kalamaja',
    kind:          'gig',
    day:           'Fri',
    time:          '21:30',
    quote:         'Loud, weird, excellent.',
    handle:        'sigmundtells',
    thumbInitials: 'EG',
    tonight:       false,
    thisWeek:      true,
    moodTags:      ['loud', 'social', 'ticketed'],
    pin:           { num: 3, left: '22%', top: '58%', eyebrow: 'Fri' },
    world_x: 245,  world_y: 685
  },
  {
    id:            'marge-monko-soft-power',
    title:         'Opening: Marge Monko, ‘Soft Power’',
    venue:         'Kai Art Center',
    neighborhood:  'Telliskivi',
    kind:          'exhibition',
    day:           'Sat',
    time:          '18:00',
    quote:         'Her sharpest show yet.',
    handle:        '@kaisa.writes',
    thumbInitials: 'MM',
    tonight:       false,
    thisWeek:      true,
    moodTags:      ['quiet', 'indoors', 'solo', 'walk-up'],
    pin:           { num: 4, left: '72%', top: '52%', eyebrow: 'Sat' },
    world_x: 690,  world_y: 330
  },
  {
    id:            'uus-laine',
    title:         'Uus Laine — late DJ bar, no lineup',
    venue:         'Uus Laine',
    neighborhood:  'Põhja-Tallinn',
    kind:          'club',
    day:           'Sat',
    time:          '23:00',
    quote:         'After midnight, no lineup, no regrets.',
    handle:        '@hel.nocturnes',
    thumbInitials: 'UL',
    tonight:       false,
    thisWeek:      true,
    moodTags:      ['loud', 'social', 'drinks', 'walk-up'],
    pin:           null
  },

  /* ── Permanent places (map only) ─────────────────────────── */
  {
    id:            'turntable-tallinn',
    title:         'Turntable Tallinn',
    venue:         'Turntable Tallinn',
    neighborhood:  'Telliskivi',
    kind:          'record store',
    day:           null,
    time:          'open daily',
    quote:         'Their B-side curation is unmatched.',
    handle:        '@mattias.v',
    thumbInitials: 'TT',
    tonight:       false,
    thisWeek:      false,
    moodTags:      ['quiet', 'indoors', 'solo', 'walk-up'],
    pin:           { num: 5, left: '46%', top: '70%', eyebrow: 'Place' },
    world_x: 650,  world_y: 480
  },
  {
    id:            'vota-voi-jata',
    title:         'Võta või Jäta',
    venue:         'Võta või Jäta',
    neighborhood:  'Põhja-Tallinn',
    kind:          'thrift',
    day:           null,
    time:          'Wed–Sun',
    quote:         'Where Tallinn’s old paperbacks rest.',
    handle:        '@mattias.v',
    thumbInitials: 'VJ',
    tonight:       false,
    thisWeek:      false,
    moodTags:      ['quiet', 'indoors', 'solo', 'walk-up'],
    pin:           { num: 6, left: '64%', top: '76%', eyebrow: 'Place' },
    world_x: 780,  world_y: 760
  },
  {
    id:            'koogi-galerii',
    title:         'Köögi Galerii',
    venue:         'Köögi Galerii',
    neighborhood:  'Kalamaja',
    kind:          'gallery',
    day:           null,
    time:          'ongoing',
    quote:         'A gallery in someone’s actual kitchen.',
    handle:        '@kaisa.writes',
    thumbInitials: 'KG',
    tonight:       false,
    thisWeek:      false,
    moodTags:      ['quiet', 'indoors', 'solo', 'walk-up'],
    pin:           { num: 7, left: '28%', top: '22%', eyebrow: 'Place' },
    world_x: 620,  world_y: 600
  },

  /* ── Reading / saved (no Briefing or map presence yet) ───── */
  {
    id:            'lugemik',
    title:         'Lugemik — independent bookshop',
    venue:         'Lugemik',
    neighborhood:  'Vanalinn',
    kind:          'bookshop',
    day:           null,
    time:          null,
    quote:         'Where I find books I didn’t know existed.',
    handle:        '@mattias.v',
    thumbInitials: 'LU',
    tonight:       false,
    thisWeek:      false,
    moodTags:      ['quiet', 'indoors', 'solo', 'walk-up'],
    pin:           null
  },
  {
    id:            'slow-cinema-talk',
    title:         'A talk on slow cinema',
    venue:         'Sõprus',
    neighborhood:  'Vanalinn',
    kind:          'lecture',
    day:           null,
    time:          null,
    quote:         'Andrei would approve.',
    handle:        '@raul.reads',
    thumbInitials: 'SC',
    tonight:       false,
    thisWeek:      false,
    moodTags:      ['quiet', 'indoors', 'solo', 'ticketed'],
    pin:           null
  },
  {
    id:            'feminine-power',
    title:         'Feminine power — group show',
    venue:         'Kumu',
    neighborhood:  'Kadriorg',
    kind:          'exhibition',
    day:           null,
    time:          null,
    quote:         'Worth a second visit.',
    handle:        '@kaisa.writes',
    thumbInitials: 'FP',
    tonight:       false,
    thisWeek:      false,
    moodTags:      ['quiet', 'indoors', 'outdoors', 'solo', 'walk-up'],
    pin:           null
  }

];

/* Curators — fictional prototype characters; one entry per handle
   that appears in the catalog above. Bios are synthesised for the
   prototype; no real person is represented.
   Fields: handle · name · tagline · bio                          */
window.WA.curators = [
  {
    handle:  'sigmundtells',
    name:    'Sigmund',
    tagline: 'The underground isn’t a place. It’s a posture.',
    bio:     'Grew up between Tartu and Riga. Spent three years running a noise collective out of a converted tram depot in Kalamaja before the building was turned into co-working. Writes a weekly Telegram channel about experimental music in the Baltics and occasionally ruins dinner parties with thoughts about the semiotics of feedback. Currently lives above a kebab shop near Balti jaam. Mourns Sveta Baar and is still not over it.'
  },
  {
    handle:  '@raul.reads',
    name:    'Raul',
    tagline: 'Reading keeps the city honest.',
    bio:     'Teaches cultural studies at Tallinn University, when not arguing about slow cinema in the back row of Sõprus. Has a particular fondness for lectures that end without conclusions. Reads two newspapers a day—one in Estonian, one in Russian—and considers this basic hygiene. His picks run toward talks, symposia, and evenings where the format is unclear but the thinking is rigorous. Believes the best event is one where you leave slightly less certain of your opinions.'
  },
  {
    handle:  '@kaisa.writes',
    name:    'Kaisa',
    tagline: 'Go to the opening. Skip the opening speech.',
    bio:     'Art critic turned occasional curator, based in Tallinn since 2018. Contributes to a couple of art magazines nobody outside the Baltics has heard of, which is how she likes it. Particular about what she calls institutional sincerity—the difference between a museum that shows difficult work because it believes in it and one that shows it for the press release. If she recommends an opening, the work is worth arriving early for.'
  },
  {
    handle:  '@hel.nocturnes',
    name:    'Hel',
    tagline: 'After midnight the city reveals itself.',
    bio:     'DJ, occasionally and reluctantly described as underground. More importantly: knows where the good after-parties are. Moved from Helsinki to Tallinn in 2021 for reasons she summarises as cheaper and weirder. Has a strict policy of never listing anything that still has a queue at 23:30. Posts roughly once a week, always about things happening that same night. Does not respond to booking enquiries via Telegram.'
  },
  {
    handle:  '@mattias.v',
    name:    'Mattias',
    tagline: 'The best things in a city are not listed anywhere.',
    bio:     'Swedish-Estonian. Has lived in Tallinn long enough to have a considered opinion about every vinyl shop within walking distance of the Old Town. Works in graphic design, which he treats as a day job for supporting a record habit. Finds thrift stores professionally interesting and personally ruinous. Reads widely in architecture and photography. Has never recommended a place without visiting it at least twice first. Suspicious of novelty; enthusiastic about permanence.'
  }
];

/* Past entries — compact archive, not filterable in this pass */
window.WA.past = [
  { id: 'skweee-sveta-baar',    title: 'Skweee night at Sveta Baar',                         date: 'Apr 11' },
  { id: 'algirdas-seskus',      title: 'Algirdas Šeškus — retrospective',      date: 'Mar 22' },
  { id: 'late-winter-readings', title: 'Late winter readings, Lugemik',                       date: 'Mar 8'  }
];
