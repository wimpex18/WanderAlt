/* map-world.js — illustrated Tallinn SVG (1800×1200 world units).
   Exports WA.mapWorldSVG() → SVG string.
   Palette harmonised to match WanderAlt's newsprint aesthetic:
   oxblood accent, muted sea, near-paper land, desaturated buildings. */

window.WA = window.WA || {};

// ─── Palette ────────────────────────────────────────────────────────────────
const M = {
  // sea — desaturated grey-blue, near paper
  sea:      'oklch(0.88 0.018 210)',
  seaSoft:  'oklch(0.92 0.012 210)',
  seaInk:   'oklch(0.55 0.04  210)',
  // land — warm newsprint cream
  land:     'oklch(0.975 0.014 78)',
  sand:     'oklch(0.955 0.028 82)',
  // districts — very faint tints over land
  d_old:    'oklch(0.962 0.018 72)',
  d_kal:    'oklch(0.962 0.018 25)',
  d_tel:    'oklch(0.962 0.012 255)',
  d_kad:    'oklch(0.955 0.024 140)',
  d_nob:    'oklch(0.958 0.016 295)',
  d_poh:    'oklch(0.962 0.010 55)',
  d_kes:    'oklch(0.962 0.010 220)',
  d_kri:    'oklch(0.960 0.014 100)',
  d_pir:    'oklch(0.958 0.020 160)',
  // parks — slightly desaturated green
  park:     'oklch(0.86 0.055 140)',
  parkDk:   'oklch(0.72 0.08  140)',
  parkLt:   'oklch(0.90 0.048 140)',
  // road / rail
  road:     'oklch(0.985 0.003 80)',
  roadEdge: 'oklch(0.88  0.010 80)',
  rail:     'oklch(0.38  0.028 280)',
  // ink
  ink:      '#111114',
  ink2:     '#2a2a2e',
  muted:    '#6b6b72',
  // building palette — reduced saturation ~40%
  wCream:   'oklch(0.94  0.030 82)',
  wMustard: 'oklch(0.88  0.072 85)',
  wPink:    'oklch(0.90  0.050 22)',
  wRose:    'oklch(0.86  0.060 18)',
  wMint:    'oklch(0.90  0.042 165)',
  wSky:     'oklch(0.88  0.042 235)',
  wLav:     'oklch(0.88  0.036 295)',
  wOlive:   'oklch(0.84  0.042 110)',
  wStone:   'oklch(0.87  0.022 70)',
  wConc:    'oklch(0.82  0.010 250)',
  rRed:     'oklch(0.50  0.140 30)',   // close to oxblood
  rRust:    'oklch(0.48  0.120 35)',
  rTerra:   'oklch(0.58  0.120 45)',
  rGreen:   'oklch(0.50  0.080 145)',
  rDark:    'oklch(0.30  0.024 60)',
  rGold:    'oklch(0.74  0.100 90)',
  // accent — oxblood (replaces signal-lime everywhere)
  hi:       '#8a2a1a',
};

// ─── Category colours (desaturated ~30%) ────────────────────────────────────
const CAT = {
  music:   { fg: 'oklch(0.96 0.02 25)',  bg: 'oklch(0.52 0.160 27)',  label: 'Music' },
  drink:   { fg: 'oklch(0.18 0.02 60)',  bg: 'oklch(0.78 0.105 78)',  label: 'Craft beer' },
  vinyl:   { fg: 'oklch(0.96 0.02 290)', bg: 'oklch(0.44 0.130 295)', label: 'Vinyl & books' },
  market:  { fg: 'oklch(0.16 0.04 145)', bg: 'oklch(0.72 0.100 140)', label: 'Flea & market' },
  culture: { fg: 'oklch(0.96 0.01 230)', bg: 'oklch(0.40 0.100 235)', label: 'Cultural space' },
  art:     { fg: 'oklch(0.96 0.015 340)', bg: 'oklch(0.50 0.130 340)', label: 'Street art' },
};
window.WA.MAP_CAT = CAT;

// ─── Tiny primitives — return SVG strings ────────────────────────────────────

function box({ x, y, w, h, fill, roof, gable = 0, windows, door = false, stroke = M.ink, sw = 1.6 }) {
  const winRows = windows?.rows || 0;
  const winCols = windows?.cols || 0;
  let wins = '';
  if (winRows && winCols) {
    const wW = (w - 6) / winCols * 0.6;
    const wH = (h - 8) / winRows * 0.5;
    const gx = (w - winCols * wW) / (winCols + 1);
    const gy = (h - winRows * wH) / (winRows + 1) - (door ? 4 : 0);
    for (let r = 0; r < winRows; r++) {
      for (let c = 0; c < winCols; c++) {
        wins += `<rect x="${x + gx + c*(wW+gx)}" y="${y + gy + r*(wH+gy)}" width="${wW}" height="${wH}" fill="${windows.fill || M.wSky}" stroke="${stroke}" stroke-width="${sw*0.55}"/>`;
      }
    }
  }
  const gableEl = gable > 0
    ? `<polygon points="${x},${y} ${x+w/2},${y-gable} ${x+w},${y}" fill="${roof}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`
    : '';
  const doorEl = door
    ? `<rect x="${x+w/2-4}" y="${y+h-12}" width="8" height="12" fill="${M.rDark}" stroke="${stroke}" stroke-width="${sw*0.6}"/>`
    : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>${gableEl}${wins}${doorEl}`;
}

function house({ x, y, w, h, fill, roof, pitch = 0.55, win = true, stroke = M.ink, sw = 1.6 }) {
  const peak = h * pitch;
  const wins = win
    ? `<rect x="${x+w*0.18}" y="${y+h*0.3}" width="${w*0.22}" height="${h*0.28}" fill="${M.wSky}" stroke="${stroke}" stroke-width="${sw*0.55}"/>
       <rect x="${x+w*0.6}" y="${y+h*0.3}" width="${w*0.22}" height="${h*0.28}" fill="${M.wSky}" stroke="${stroke}" stroke-width="${sw*0.55}"/>`
    : '';
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
    <polygon points="${x-2},${y} ${x+w/2},${y-peak} ${x+w+2},${y}" fill="${roof}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
    ${wins}
  </g>`;
}

function onionDome({ cx, baseY, w, h, fill = M.rDark, cross = true, stroke = M.ink, sw = 1.6 }) {
  const r = w / 2;
  const neck = h * 0.55;
  const crossEl = cross
    ? `<line x1="${cx-3}" y1="${baseY-neck-h*0.84}" x2="${cx+3}" y2="${baseY-neck-h*0.84}" stroke="${stroke}" stroke-width="${sw*0.9}" stroke-linecap="round"/>`
    : '';
  return `<g>
    <rect x="${cx-r*0.45}" y="${baseY-neck}" width="${r*0.9}" height="${neck}" fill="${M.wStone}" stroke="${stroke}" stroke-width="${sw}"/>
    <path d="M ${cx-r},${baseY-neck} Q ${cx-r*1.05},${baseY-neck-h*0.4} ${cx-r*0.3},${baseY-neck-h*0.55} Q ${cx},${baseY-neck-h*0.75} ${cx+r*0.3},${baseY-neck-h*0.55} Q ${cx+r*1.05},${baseY-neck-h*0.4} ${cx+r},${baseY-neck} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
    <line x1="${cx}" y1="${baseY-neck-h*0.75}" x2="${cx}" y2="${baseY-neck-h*0.92}" stroke="${stroke}" stroke-width="${sw*1.1}" stroke-linecap="round"/>
    ${crossEl}
  </g>`;
}

function roundTower({ cx, baseY, r, h, fill = M.wStone, cap = M.rRed, cone = 1.1, stroke = M.ink, sw = 1.6, flag = false }) {
  const crens = [0,1,2,3].map(i =>
    `<rect x="${cx-r+i*(r/2)}" y="${baseY-h-4}" width="${r*0.4}" height="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
  ).join('');
  const coneEl = cone > 0
    ? `<polygon points="${cx-r-1},${baseY-h-4} ${cx},${baseY-h-4-r*cone*1.7} ${cx+r+1},${baseY-h-4}" fill="${cap}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`
    : '';
  const flagEl = flag ? `
    <line x1="${cx}" y1="${baseY-h-4-r*cone*1.7}" x2="${cx}" y2="${baseY-h-4-r*cone*1.7-22}" stroke="${stroke}" stroke-width="${sw}"/>
    <polygon points="${cx},${baseY-h-4-r*cone*1.7-22} ${cx+14},${baseY-h-4-r*cone*1.7-18} ${cx+14},${baseY-h-4-r*cone*1.7-11} ${cx},${baseY-h-4-r*cone*1.7-7}" fill="${M.hi}" stroke="${stroke}" stroke-width="${sw*0.8}"/>
  ` : '';
  return `<g>
    <rect x="${cx-r}" y="${baseY-h}" width="${r*2}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
    ${crens}
    ${coneEl}
    <rect x="${cx-1.5}" y="${baseY-h*0.5}" width="3" height="${h*0.18}" fill="${M.rDark}"/>
    ${flagEl}
  </g>`;
}

function spire({ cx, baseY, w, h, fill = M.rDark, body = M.wStone, stroke = M.ink, sw = 1.6 }) {
  const bodyH = h * 0.45, spireH = h * 0.55;
  return `<g>
    <rect x="${cx-w/2}" y="${baseY-bodyH}" width="${w}" height="${bodyH}" fill="${body}" stroke="${stroke}" stroke-width="${sw}"/>
    <rect x="${cx-2}" y="${baseY-bodyH*0.75}" width="4" height="6" fill="${M.rDark}"/>
    <rect x="${cx-2}" y="${baseY-bodyH*0.5}" width="4" height="6" fill="${M.rDark}"/>
    <polygon points="${cx-w/2-1},${baseY-bodyH} ${cx},${baseY-bodyH-spireH*0.2} ${cx+w/2+1},${baseY-bodyH}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
    <polygon points="${cx-w/4},${baseY-bodyH-spireH*0.18} ${cx},${baseY-bodyH-spireH} ${cx+w/4},${baseY-bodyH-spireH*0.18}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
    <line x1="${cx}" y1="${baseY-bodyH-spireH}" x2="${cx}" y2="${baseY-bodyH-spireH-6}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>
  </g>`;
}

function tree({ cx, cy, r = 12, fill = M.parkDk, stroke = M.ink, sw = 1.2 }) {
  return `<g>
    <line x1="${cx}" y1="${cy+r*0.8}" x2="${cx}" y2="${cy+r*1.6}" stroke="${stroke}" stroke-width="${sw}"/>
    <circle cx="${cx-r*0.45}" cy="${cy}" r="${r*0.7}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
    <circle cx="${cx+r*0.45}" cy="${cy}" r="${r*0.7}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cy-r*0.45}" r="${r*0.7}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
  </g>`;
}

function conifer({ cx, baseY, h = 28, w = 16, fill = M.parkDk, stroke = M.ink, sw = 1.2 }) {
  return `<g>
    <polygon points="${cx},${baseY-h} ${cx-w/2},${baseY} ${cx+w/2},${baseY}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
    <rect x="${cx-1.5}" y="${baseY}" width="3" height="4" fill="${M.rDark}" stroke="${stroke}" stroke-width="${sw*0.6}"/>
  </g>`;
}

function grove({ x, y, w, h, n = 7, seed = 1 }) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, (_, i) => {
    const cx = x + rnd() * w;
    const by = y + rnd() * h;
    const hh = 18 + rnd() * 18;
    return conifer({ cx, baseY: by, h: hh, w: hh * 0.55, fill: i % 3 === 0 ? M.park : M.parkDk });
  }).join('');
}

// ─── Landmark vignettes ──────────────────────────────────────────────────────

function nevskyCathedral({ x, y, scale = 1 }) {
  const arches = [-30,-10,10,30].map(dx =>
    `<rect x="${dx-5}" y="-18" width="10" height="20" fill="${M.rDark}" stroke="${M.ink}" stroke-width="1" rx="4"/>`
  ).join('');
  const domes = [
    onionDome({ cx: 0,   baseY: -36, w: 32, h: 48, fill: M.rDark }),
    onionDome({ cx: -30, baseY: -36, w: 20, h: 30, fill: M.rDark }),
    onionDome({ cx:  30, baseY: -36, w: 20, h: 30, fill: M.rDark }),
    onionDome({ cx: -46, baseY: -36, w: 14, h: 22, fill: M.rDark, cross: false }),
    onionDome({ cx:  46, baseY: -36, w: 14, h: 22, fill: M.rDark, cross: false }),
  ].join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <rect x="-46" y="-36" width="92" height="48" fill="${M.wPink}" stroke="${M.ink}" stroke-width="1.6"/>
    <rect x="-46" y="-30" width="92" height="4" fill="${M.rTerra}" stroke="${M.ink}" stroke-width="1.2"/>
    ${arches}
    ${domes}
  </g>`;
}

function toompeaCastle({ x, y, scale = 1 }) {
  const crens = [-30,-18,-6,6].map((dx, i) =>
    `<rect x="${dx}" y="-34" width="6" height="4" fill="${M.wStone}" stroke="${M.ink}" stroke-width="1.2"/>`
  ).join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    ${box({ x: -38, y: -30, w: 50, h: 36, fill: M.wStone, roof: M.rRust, stroke: M.ink, sw: 1.6, windows: { rows: 1, cols: 3, fill: M.rDark } })}
    ${crens}
    ${roundTower({ cx: 28, baseY: 6, r: 11, h: 70, fill: M.wStone, cap: M.rRust, cone: 1.2, flag: true })}
  </g>`;
}

function stOlafChurch({ x, y, scale = 1 }) {
  return `<g transform="translate(${x},${y}) scale(${scale})">
    ${spire({ cx: 0, baseY: 0, w: 28, h: 110, fill: M.rDark, body: M.wStone })}
    <rect x="-26" y="-30" width="14" height="30" fill="${M.wStone}" stroke="${M.ink}" stroke-width="1.4"/>
  </g>`;
}

function townHall({ x, y, scale = 1 }) {
  const arcades = [-36,-22,-8,6,20].map(dx =>
    `<path d="M ${dx} 6 L ${dx} -2 Q ${dx+5} -8 ${dx+10} -2 L ${dx+10} 6 Z" fill="${M.rDark}" stroke="${M.ink}" stroke-width="1"/>`
  ).join('');
  const upWins = [-32,-18,-4,10,24].map(dx =>
    `<rect x="${dx}" y="-22" width="6" height="10" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>`
  ).join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <rect x="-44" y="-28" width="78" height="34" fill="${M.wMustard}" stroke="${M.ink}" stroke-width="1.6"/>
    ${arcades}
    ${upWins}
    <rect x="36" y="-46" width="16" height="52" fill="${M.wMustard}" stroke="${M.ink}" stroke-width="1.6"/>
    <circle cx="44" cy="-34" r="5" fill="${M.wStone}" stroke="${M.ink}" stroke-width="1.2"/>
    <line x1="44" y1="-34" x2="44" y2="-37" stroke="${M.ink}" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="44" y1="-34" x2="46" y2="-34" stroke="${M.ink}" stroke-width="1.2" stroke-linecap="round"/>
    <polygon points="36,-46 44,-74 52,-46" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <polygon points="40,-74 44,-90 48,-74" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <line x1="44" y1="-90" x2="44" y2="-96" stroke="${M.ink}" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="44" cy="-98" r="2" fill="${M.hi}" stroke="${M.ink}" stroke-width="1"/>
  </g>`;
}

function gableHouse({ x, y, wallFill, roofFill, h = 50, w = 26 }) {
  return `<g transform="translate(${x},${y})">
    <rect x="${-w/2}" y="${-h}" width="${w}" height="${h}" fill="${wallFill}" stroke="${M.ink}" stroke-width="1.4"/>
    <polygon points="${-w/2-1},${-h} ${-w/2-1},${-h-6} ${-w/4},${-h-6} ${-w/4},${-h-12} 0,${-h-12} 0,${-h-18} ${w/4},${-h-12} ${w/4},${-h-6} ${w/2+1},${-h-6} ${w/2+1},${-h}" fill="${roofFill}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="${-w*0.32}" y="${-h*0.78}" width="${w*0.22}" height="${h*0.16}" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    <rect x="${w*0.1}" y="${-h*0.78}" width="${w*0.22}" height="${h*0.16}" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    <rect x="${-w*0.32}" y="${-h*0.5}" width="${w*0.22}" height="${h*0.16}" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    <rect x="${w*0.1}" y="${-h*0.5}" width="${w*0.22}" height="${h*0.16}" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    <rect x="-3" y="${-h*0.24}" width="6" height="${h*0.24}" fill="${M.rDark}" stroke="${M.ink}" stroke-width="0.9"/>
  </g>`;
}

function kiekTower({ x, y, scale = 1 }) {
  return `<g transform="translate(${x},${y}) scale(${scale})">${roundTower({ cx: 0, baseY: 0, r: 16, h: 48, fill: M.wStone, cap: M.rRust, cone: 1.1 })}</g>`;
}

function patareiPrison({ x, y, scale = 1 }) {
  const wins = Array.from({ length: 18 }, (_, i) =>
    `<rect x="${-66+i*8}" y="-16" width="4" height="6" fill="${M.rDark}"/>`
  ).join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <rect x="-72" y="-22" width="144" height="26" fill="${M.wMustard}" stroke="${M.ink}" stroke-width="1.6"/>
    <rect x="-72" y="-26" width="144" height="5" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.2"/>
    ${wins}
    <rect x="-2" y="-10" width="6" height="14" fill="${M.rDark}" stroke="${M.ink}" stroke-width="0.8"/>
  </g>`;
}

function lennusadam({ x, y, scale = 1 }) {
  const domes = [-44,0,44].map(dx => `<g>
    <path d="M ${dx-26},6 A 26 22 0 0 1 ${dx+26},6 Z" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.6"/>
    <path d="M ${dx-26},6 A 26 22 0 0 1 ${dx+26},6" fill="none" stroke="${M.ink}" stroke-width="1.6"/>
    <path d="M ${dx-14},-12 Q ${dx} -22 ${dx+14},-12" fill="none" stroke="${M.ink}" stroke-width="0.8" opacity="0.55"/>
  </g>`).join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    ${domes}
    <rect x="-72" y="6" width="144" height="6" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4"/>
  </g>`;
}

function linnahall({ x, y, scale = 1 }) {
  const tufts = Array.from({ length: 6 }, (_, i) =>
    `<line x1="${-26+i*11}" y1="-30" x2="${-26+i*11}" y2="-34" stroke="${M.parkDk}" stroke-width="1.4" stroke-linecap="round"/>`
  ).join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <polygon points="-80,0 80,0 64,-12 -64,-12" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <polygon points="-64,-12 64,-12 48,-22 -48,-22" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <polygon points="-48,-22 48,-22 32,-30 -32,-30" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    ${tufts}
  </g>`;
}

function kadriorgPalace({ x, y, scale = 1 }) {
  const sideWins = [-48,-38,-28,28,38,48].map(dx =>
    `<rect x="${dx-3}" y="-16" width="6" height="14" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>`
  ).join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <rect x="-58" y="-22" width="116" height="30" fill="${M.wPink}" stroke="${M.ink}" stroke-width="1.6"/>
    <rect x="-58" y="-26" width="116" height="5" fill="${M.rTerra}" stroke="${M.ink}" stroke-width="1.2"/>
    <rect x="-22" y="-38" width="44" height="20" fill="${M.wPink}" stroke="${M.ink}" stroke-width="1.6"/>
    <polygon points="-26,-38 0,-50 26,-38" fill="${M.rTerra}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="-6" y="-34" width="12" height="14" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    ${sideWins}
  </g>`;
}

function kumuMuseum({ x, y, scale = 1 }) {
  const lines = Array.from({ length: 5 }, (_, i) =>
    `<line x1="${-40+i*13}" y1="${-24+i*1.2}" x2="${-40+i*13}" y2="4" stroke="${M.ink}" stroke-width="0.6" opacity="0.5"/>`
  ).join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <polygon points="-44,4 -44,-24 26,-30 26,-4 26,4" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="26" y="-32" width="24" height="36" fill="${M.rDark}" stroke="${M.ink}" stroke-width="1.4"/>
    ${lines}
  </g>`;
}

function telliskiviHall({ x, y, scale = 1 }) {
  const zigzag = '-66,-18 -54,-30 -42,-18 -30,-30 -18,-18 -6,-30 6,-18 18,-30 30,-18 42,-30 54,-18 66,-18';
  const wins = [-58,-38,-18,2,22,42].map(dx =>
    `<rect x="${dx}" y="-12" width="14" height="12" fill="${M.wSky}" stroke="${M.ink}" stroke-width="1"/>`
  ).join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <rect x="-66" y="-18" width="132" height="22" fill="${M.wRose}" stroke="${M.ink}" stroke-width="1.6"/>
    <polygon points="${zigzag}" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    ${wins}
  </g>`;
}

function kalamajaHouse({ x, y, wallFill, roofFill, scale = 1 }) {
  return `<g transform="translate(${x},${y}) scale(${scale})">
    ${house({ x: -18, y: -22, w: 36, h: 22, fill: wallFill, roof: roofFill, pitch: 0.7 })}
    <rect x="-2" y="-12" width="4" height="12" fill="${M.rDark}" stroke="${M.ink}" stroke-width="0.8"/>
  </g>`;
}

function trainStation({ x, y, scale = 1 }) {
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <rect x="-40" y="-20" width="80" height="24" fill="${M.wCream}" stroke="${M.ink}" stroke-width="1.6"/>
    <rect x="-40" y="-24" width="80" height="5" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.2"/>
    <circle cx="0" cy="-10" r="5" fill="${M.wStone}" stroke="${M.ink}" stroke-width="1.2"/>
    <line x1="0" y1="-10" x2="0" y2="-13" stroke="${M.ink}" stroke-width="1.1" stroke-linecap="round"/>
    <line x1="0" y1="-10" x2="2.5" y2="-10" stroke="${M.ink}" stroke-width="1.1" stroke-linecap="round"/>
    <rect x="-40" y="4" width="80" height="3" fill="${M.rDark}"/>
  </g>`;
}

function tvTower({ x, y, scale = 1 }) {
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <rect x="-14" y="-6" width="28" height="10" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4"/>
    <rect x="-3" y="-110" width="6" height="104" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4"/>
    <ellipse cx="0" cy="-110" rx="14" ry="6" fill="${M.wStone}" stroke="${M.ink}" stroke-width="1.4"/>
    <ellipse cx="0" cy="-114" rx="11" ry="4" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.2"/>
    <line x1="0" y1="-117" x2="0" y2="-150" stroke="${M.ink}" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="0" y1="-150" x2="0" y2="-160" stroke="${M.hi}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="0" cy="-160" r="2" fill="${M.rRed}" stroke="${M.ink}" stroke-width="1"/>
  </g>`;
}

function ferrisWheel({ x, y, r = 26, scale = 1 }) {
  const cabins = 8;
  const colors = [M.wPink, M.wMint, M.wMustard, M.wLav, M.wSky, M.wRose, M.wOlive, M.wPink];
  const spokes = Array.from({ length: cabins }, (_, i) => {
    const a = (i / cabins) * Math.PI * 2;
    return `<line x1="0" y1="0" x2="${Math.cos(a)*r}" y2="${Math.sin(a)*r}" stroke="${M.ink}" stroke-width="0.9" opacity="0.7"/>`;
  }).join('');
  const cabinEls = Array.from({ length: cabins }, (_, i) => {
    const a = (i / cabins) * Math.PI * 2;
    const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
    return `<rect x="${cx-3}" y="${cy-2}" width="6" height="5" fill="${colors[i]}" stroke="${M.ink}" stroke-width="1" rx="1"/>`;
  }).join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <line x1="${-r*0.7}" y1="${r+8}" x2="0" y2="0" stroke="${M.ink}" stroke-width="1.6"/>
    <line x1="${r*0.7}" y1="${r+8}" x2="0" y2="0" stroke="${M.ink}" stroke-width="1.6"/>
    <rect x="${-r}" y="${r+8}" width="${r*2}" height="5" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4"/>
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="${M.ink}" stroke-width="1.8"/>
    ${spokes}
    ${cabinEls}
    <circle cx="0" cy="0" r="3" fill="${M.hi}" stroke="${M.ink}" stroke-width="1.2"/>
  </g>`;
}

function glassTower({ x, y, w = 22, h = 50, fill = M.wConc, accent = M.wSky }) {
  const bands = Array.from({ length: Math.floor(h/6) }, (_, i) =>
    `<line x1="${x-w/2+1}" y1="${y-h+i*6+3}" x2="${x+w/2-1}" y2="${y-h+i*6+3}" stroke="${accent}" stroke-width="1.4" opacity="0.55"/>`
  ).join('');
  return `<g>
    <rect x="${x-w/2}" y="${y-h}" width="${w}" height="${h}" fill="${fill}" stroke="${M.ink}" stroke-width="1.4"/>
    ${bands}
    <line x1="${x-w/4}" y1="${y-h}" x2="${x-w/4}" y2="${y}" stroke="${M.ink}" stroke-width="0.6" opacity="0.4"/>
    <line x1="${x+w/4}" y1="${y-h}" x2="${x+w/4}" y2="${y}" stroke="${M.ink}" stroke-width="0.6" opacity="0.4"/>
    <rect x="${x-w/2}" y="${y-h-2}" width="${w}" height="3" fill="${M.rDark}"/>
  </g>`;
}

function tramLine({ d, color = M.rail, sw = 1.6 }) {
  return `<g>
    <path d="${d}" stroke="${color}" stroke-width="${sw+4}" fill="none" opacity="0.18" stroke-linecap="round"/>
    <path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
    <path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-dasharray="2 6" opacity="0.6"/>
  </g>`;
}

function tramCar({ x, y, color = M.rRed, scale = 1, dir = 'right' }) {
  const flip = dir === 'left' ? 'scale(-1,1)' : '';
  return `<g transform="translate(${x},${y}) scale(${scale}) ${flip}">
    <rect x="-18" y="-8" width="36" height="14" rx="3" fill="${color}" stroke="${M.ink}" stroke-width="1.4"/>
    <rect x="-16" y="-6" width="8" height="5" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.8"/>
    <rect x="-7" y="-6" width="6" height="5" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.8"/>
    <rect x="0" y="-6" width="6" height="5" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.8"/>
    <rect x="7" y="-6" width="8" height="5" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.8"/>
    <line x1="-12" y1="7" x2="12" y2="7" stroke="${M.ink}" stroke-width="1.4"/>
  </g>`;
}

function shoppingMall({ x, y, w = 88, h = 28, fill = M.wMustard, label = '' }) {
  const wins = Array.from({ length: Math.floor(w/14) }, (_, i) =>
    `<rect x="${x-w/2+6+i*14}" y="${y-h*0.6}" width="9" height="${h*0.35}" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>`
  ).join('');
  const lbl = label ? `<text x="${x}" y="${y-h-8}" text-anchor="middle" font-family="Geist Mono,monospace" font-size="10" font-weight="600" fill="${M.ink}" stroke="white" stroke-width="3" paint-order="stroke">${label}</text>` : '';
  return `<g>
    <rect x="${x-w/2}" y="${y-h}" width="${w}" height="${h}" fill="${fill}" stroke="${M.ink}" stroke-width="1.6"/>
    <rect x="${x-w/2-2}" y="${y-h-4}" width="${w+4}" height="6" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.4"/>
    ${wins}
    <rect x="${x-6}" y="${y-10}" width="12" height="10" fill="${M.rDark}" stroke="${M.ink}" stroke-width="0.9"/>
    ${lbl}
  </g>`;
}

function whiteMuseum({ x, y, w = 36, h = 26 }) {
  return `<g>
    <rect x="${x-w/2}" y="${y-h}" width="${w}" height="${h}" fill="#ffffff" stroke="${M.ink}" stroke-width="1.6"/>
    <polygon points="${x-w/2-1},${y-h} ${x},${y-h-12} ${x+w/2+1},${y-h}" fill="#ffffff" stroke="${M.ink}" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="${x-w*0.32}" y="${y-h*0.62}" width="${w*0.18}" height="${h*0.28}" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    <rect x="${x-w*0.08}" y="${y-h*0.62}" width="${w*0.18}" height="${h*0.28}" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    <rect x="${x+w*0.16}" y="${y-h*0.62}" width="${w*0.18}" height="${h*0.28}" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    <rect x="${x-3}" y="${y-10}" width="6" height="10" fill="${M.rDark}" stroke="${M.ink}" stroke-width="0.8"/>
  </g>`;
}

function brickFactory({ x, y, w = 60, h = 28, fill = M.wRose, label = '' }) {
  const pts = `${x-w/2},${y-h} ${x-w/2+10},${y-h-8} ${x-w/2+20},${y-h} ${x-w/2+30},${y-h-8} ${x-w/2+40},${y-h} ${x-w/2+50},${y-h-8} ${x-w/2+60},${y-h}`;
  const wins = [0,1,2,3].map(i =>
    `<rect x="${x-w/2+6+i*14}" y="${y-h*0.55}" width="9" height="${h*0.35}" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>`
  ).join('');
  const lbl = label ? `<text x="${x}" y="${y-h-22}" text-anchor="middle" font-family="Geist Mono,monospace" font-size="10" font-weight="600" fill="${M.ink}" stroke="white" stroke-width="3" paint-order="stroke">${label}</text>` : '';
  return `<g>
    <rect x="${x-w/2}" y="${y-h}" width="${w}" height="${h}" fill="${fill}" stroke="${M.ink}" stroke-width="1.6"/>
    <polygon points="${pts}" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    ${wins}
    <rect x="${x+w/2+2}" y="${y-h-14}" width="6" height="${h+14}" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.2"/>
    <rect x="${x+w/2+1}" y="${y-h-17}" width="8" height="4" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.2"/>
    ${lbl}
  </g>`;
}

function tinyBldg({ x, y, w = 28, h = 16, fill = M.wMustard, roof = M.rRust, label = '', labelDy = 12 }) {
  const lbl = label ? `<text x="${x}" y="${y+labelDy}" text-anchor="middle" font-family="Geist Mono,monospace" font-size="10" font-weight="600" fill="${M.ink}" stroke="white" stroke-width="3" paint-order="stroke">${label}</text>` : '';
  return `<g>
    <rect x="${x-w/2}" y="${y-h}" width="${w}" height="${h}" fill="${fill}" stroke="${M.ink}" stroke-width="1.4"/>
    <rect x="${x-w/2-1}" y="${y-h-3}" width="${w+2}" height="4" fill="${roof}" stroke="${M.ink}" stroke-width="1.2"/>
    <rect x="${x-2}" y="${y-h*0.55}" width="4" height="5" fill="${M.rDark}"/>
    ${lbl}
  </g>`;
}

function viruHotel({ x, y, scale = 1 }) {
  const rows = Array.from({ length: 11 }, (_, r) =>
    `<line x1="-14" y1="${-62+r*6}" x2="14" y2="${-62+r*6}" stroke="${M.ink}" stroke-width="0.6" opacity="0.55"/>`
  ).join('');
  const cols = [-9,-3,3,9].map(dx =>
    `<line x1="${dx}" y1="-66" x2="${dx}" y2="0" stroke="${M.ink}" stroke-width="0.5" opacity="0.45"/>`
  ).join('');
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <rect x="-14" y="-66" width="28" height="66" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.6"/>
    ${rows}
    ${cols}
    <rect x="-10" y="-72" width="20" height="5" fill="${M.hi}" stroke="${M.ink}" stroke-width="1.1"/>
  </g>`;
}

function ferryIcon({ x, y }) {
  return `<g>
    <rect x="${x-28}" y="${y-4}" width="56" height="6" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4"/>
    <path d="M ${x-22} ${y-14} L ${x+22} ${y-14} L ${x+16} ${y-4} L ${x-16} ${y-4} Z" fill="${M.wPink}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="${x-14}" y="${y-22}" width="28" height="8" fill="${M.wCream}" stroke="${M.ink}" stroke-width="1.4"/>
    <rect x="${x+6}" y="${y-32}" width="6" height="10" fill="${M.rRed}" stroke="${M.ink}" stroke-width="1.4"/>
    <text x="${x}" y="${y+16}" text-anchor="middle" font-family="Geist Mono,monospace" font-size="11" font-weight="600" fill="${M.ink}" stroke="white" stroke-width="3" paint-order="stroke">Ferry Terminal</text>
  </g>`;
}

function busStation({ x, y }) {
  return `<g>
    <rect x="${x-18}" y="${y-12}" width="36" height="20" rx="3" fill="${M.wMustard}" stroke="${M.ink}" stroke-width="1.4"/>
    <rect x="${x-14}" y="${y-9}" width="6" height="5" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    <rect x="${x-6}" y="${y-9}" width="6" height="5" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    <rect x="${x+2}" y="${y-9}" width="6" height="5" fill="${M.wSky}" stroke="${M.ink}" stroke-width="0.9"/>
    <circle cx="${x-11}" cy="${y+8}" r="3" fill="${M.rDark}" stroke="${M.ink}" stroke-width="1.1"/>
    <circle cx="${x+11}" cy="${y+8}" r="3" fill="${M.rDark}" stroke="${M.ink}" stroke-width="1.1"/>
    <text x="${x}" y="${y+24}" text-anchor="middle" font-family="Geist Mono,monospace" font-size="11" font-weight="600" fill="${M.ink}" stroke="white" stroke-width="3" paint-order="stroke">Bus Station</text>
  </g>`;
}

function placeDot({ x, y, label, color = M.hi, align = 'right', dy = 4, fontSize = 10 }) {
  const lx = align === 'right' ? x + 12 : align === 'left' ? x - 12 : x;
  const anchor = align === 'right' ? 'start' : align === 'left' ? 'end' : 'middle';
  return `<g style="pointer-events:none">
    <circle cx="${x}" cy="${y}" r="5.5" fill="${color}" stroke="${M.ink}" stroke-width="1.4"/>
    <circle cx="${x}" cy="${y}" r="1.6" fill="${M.ink}"/>
    <text x="${lx}" y="${y+dy}" text-anchor="${anchor}" font-family="Geist Mono,monospace" font-size="${fontSize}" font-weight="600" fill="${M.ink}" stroke="white" stroke-width="3.2" paint-order="stroke">${label}</text>
  </g>`;
}

function parkPatch({ x, y, w, h, seed = 7 }) {
  return `<g>
    <ellipse cx="${x}" cy="${y}" rx="${w/2}" ry="${h/2}" fill="${M.park}" stroke="${M.parkDk}" stroke-width="1.1"/>
    ${grove({ x: x-w/2+4, y: y-h/2+4, w: w-8, h: h-8, n: Math.max(3, Math.floor(w*h/800)), seed })}
  </g>`;
}

function igloo({ x, y, r = 8, fill = M.wConc }) {
  return `<g>
    <path d="M ${x-r} ${y} A ${r} ${r*0.85} 0 0 1 ${x+r} ${y} Z" fill="${fill}" stroke="${M.ink}" stroke-width="1.3"/>
    <rect x="${x-2}" y="${y-4}" width="4" height="4" fill="${M.rDark}" stroke="${M.ink}" stroke-width="0.8"/>
    <path d="M ${x-r*0.6} ${y-3} A ${r*0.6} ${r*0.4} 0 0 1 ${x+r*0.6} ${y-3}" fill="none" stroke="${M.ink}" stroke-width="0.6" opacity="0.6"/>
  </g>`;
}

function freedomCross({ x, y, scale = 1 }) {
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <rect x="-30" y="-2" width="60" height="5" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.2"/>
    <rect x="-3" y="-50" width="6" height="48" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4"/>
    <rect x="-8" y="-60" width="16" height="18" fill="${M.wSky}" stroke="${M.ink}" stroke-width="1.4" opacity="0.85"/>
    <polygon points="-3,-60 -3,-72 3,-72 3,-60" fill="${M.wSky}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <polygon points="-3,-48 -3,-60 3,-60 3,-48" fill="${M.wSky}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <polygon points="-12,-58 -8,-58 -8,-50 -12,-50" fill="${M.wSky}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
    <polygon points="8,-58 12,-58 12,-50 8,-50" fill="${M.wSky}" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>
  </g>`;
}

// ─── MapWorld — full 1800×1200 SVG string ────────────────────────────────────

WA.mapWorldSVG = function mapWorldSVG() {
  const sea  = M.sea;
  const land = M.land;

  // railway ties
  const railTies = Array.from({ length: 24 }, (_, i) => {
    const t = i / 24;
    const ry = 420 + t * (1100 - 420);
    const rx = 855 + 13 - Math.sin(t * 2.4) * 25 - t * 14;
    return `<line x1="${rx-9}" y1="${ry}" x2="${rx+9}" y2="${ry}" stroke="${M.rail}" stroke-width="1.4" opacity="0.7"/>`;
  }).join('');

  // old-town wall tower dots
  const wallDots = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const cx = 1045 + Math.cos(a) * 175;
    const cy = 575 + Math.sin(a) * 130;
    return `<circle cx="${cx}" cy="${cy}" r="4" fill="${M.wStone}" stroke="${M.ink}" stroke-width="1.4"/>`;
  }).join('');

  // kopli residential houses
  const kopliHouses = [
    [120,470,M.wMint],[165,475,M.wPink],[210,472,M.wMustard],
    [120,515,M.wOlive],[165,520,M.wSky],[210,517,M.wLav],
    [80,575,M.wPink],[125,580,M.wMint],[170,577,M.wMustard],[215,580,M.wRose],
  ].map(([hx,hy,c]) => kalamajaHouse({ x: hx, y: hy, wallFill: c, roofFill: M.rRust, scale: 0.85 })).join('');

  // kalamaja houses
  const kalamajaHouses = [
    [500,460,M.wMint],[540,465,M.wPink],[580,462,M.wMustard],[620,465,M.wLav],
    [490,540,M.wRose],[530,545,M.wMint],[570,542,M.wSky],[610,545,M.wPink],
  ].map(([hx,hy,c], i) => kalamajaHouse({ x: hx, y: hy, wallFill: c, roofFill: i%2 ? M.rRust : M.rTerra })).join('');

  // old-town gable houses
  const oldTownGables = [
    [1080,660,M.wPink,M.rRust],[1110,660,M.wMint,M.rRust],[1140,660,M.wMustard,M.rRust],
    [965,700,M.wRose,M.rRust],[995,700,M.wLav,M.rRust],
  ].map(([gx,gy,wf,rf]) => gableHouse({ x:gx, y:gy, wallFill:wf, roofFill:rf, h:40, w:22 })).join('');

  // district labels
  const districtLabels = [
    { text:'KOPLI',     x:180,  y:400, size:26 },
    { text:'NOBLESSNER',x:580,  y:195, size:20 },
    { text:'KALAMAJA',  x:560,  y:420, size:26 },
    { text:'TELLISKIVI',x:690,  y:830, size:26 },
    { text:'VANALINN',  x:1030, y:448, size:28 },
    { text:'KESKLINN',  x:1190, y:580, size:22 },
    { text:'KADRIORG',  x:1430, y:555, size:26 },
    { text:'PIRITA',    x:1710, y:510, size:24 },
    { text:'KRISTIINE', x:800,  y:960, size:24 },
  ].map(l => `<text x="${l.x}" y="${l.y}" text-anchor="middle" font-family="Geist Mono,monospace" font-size="${l.size}" letter-spacing="4" font-weight="600" fill="${M.ink}" stroke="white" stroke-width="4" paint-order="stroke" opacity="0.55">${l.text}</text>`).join('');

  // landmark labels
  const landmarkLabels = [
    { text:'Toompea',                   x:910,  y:630 },
    { text:'Alexander Nevsky',          x:970,  y:620 },
    { text:"St Olaf's",                 x:1150, y:388 },
    { text:'Town Hall',                 x:1015, y:668 },
    { text:'Kiek in de Kök',            x:895,  y:730 },
    { text:'Lennusadam',                x:680,  y:262 },
    { text:'Patarei',                   x:500,  y:326 },
    { text:'Linnahall',                 x:900,  y:344 },
    { text:'KUMU',                      x:1500, y:660 },
    { text:'TV Tower',                  x:1680, y:448 },
    { text:'Balti Jaam · Train + Market', x:770, y:500, muted:true, size:14 },
    { text:'Viru Hotel',                x:1240, y:628, muted:true, size:14 },
  ].map(l => `<text x="${l.x}" y="${l.y}" text-anchor="middle" font-family="DM Serif Display,Georgia,serif" font-style="italic" font-size="${l.size || 15}" fill="${l.muted ? M.muted : M.ink}" opacity="${l.muted ? 0.75 : 1}" stroke="white" stroke-width="3.6" paint-order="stroke">${l.text}</text>`).join('');

  // free labels
  const freeLabels = [
    `<text x="1100" y="150" text-anchor="middle" font-family="Geist Mono,monospace" font-size="16" letter-spacing="3" fill="${M.seaInk}" opacity="0.55" stroke="white" stroke-width="3" paint-order="stroke">BALTIC  SEA</text>`,
    `<text x="1260" y="417" text-anchor="middle" font-family="DM Serif Display,Georgia,serif" font-style="italic" font-size="13" fill="${M.muted}" stroke="white" stroke-width="3" paint-order="stroke">Reidi tee</text>`,
    `<text x="1430" y="650" text-anchor="middle" font-family="DM Serif Display,Georgia,serif" font-style="italic" font-size="18" fill="${M.parkDk}" stroke="white" stroke-width="3.6" paint-order="stroke">Kadriorg Park</text>`,
    `<text x="1710" y="620" text-anchor="middle" font-family="DM Serif Display,Georgia,serif" font-style="italic" font-size="14" fill="${M.parkDk}" stroke="white" stroke-width="3" paint-order="stroke">Pirita rand</text>`,
    `<text x="1170" y="798" text-anchor="middle" font-family="DM Serif Display,Georgia,serif" font-style="italic" font-size="13" fill="${M.parkDk}" stroke="white" stroke-width="3" paint-order="stroke">Tammsaare park</text>`,
    `<text x="555" y="500" text-anchor="middle" font-family="DM Serif Display,Georgia,serif" font-style="italic" font-size="12" fill="${M.muted}" stroke="white" stroke-width="3" paint-order="stroke">Vana-Kalamaja</text>`,
    `<text x="1520" y="1055" text-anchor="middle" font-family="DM Serif Display,Georgia,serif" font-style="italic" font-size="18" fill="${M.seaInk}" stroke="white" stroke-width="3" paint-order="stroke">Ülemiste järv</text>`,
  ].join('');

  return `<svg viewBox="0 0 1800 1200" width="1800" height="1200" style="display:block;shape-rendering:geometricPrecision">
  <defs>
    <pattern id="wa-waves" x="0" y="0" width="56" height="22" patternUnits="userSpaceOnUse">
      <path d="M 0 14 Q 14 6 28 14 T 56 14" fill="none" stroke="${M.seaInk}" stroke-opacity="0.18" stroke-width="1.2"/>
    </pattern>
    <pattern id="wa-waves2" x="0" y="11" width="56" height="22" patternUnits="userSpaceOnUse">
      <path d="M 0 14 Q 14 6 28 14 T 56 14" fill="none" stroke="${M.seaInk}" stroke-opacity="0.10" stroke-width="0.9"/>
    </pattern>
    <pattern id="wa-parkdots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.1" fill="${M.parkDk}" opacity="0.35"/>
      <circle cx="9" cy="8" r="0.9" fill="${M.parkDk}" opacity="0.25"/>
    </pattern>
    <pattern id="wa-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.03)" stroke-width="1"/>
    </pattern>
    <pattern id="wa-sand" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
      <rect width="14" height="14" fill="${M.sand}"/>
      <circle cx="3" cy="3" r="0.6" fill="oklch(0.74 0.06 70)" opacity="0.6"/>
      <circle cx="9" cy="9" r="0.6" fill="oklch(0.74 0.06 70)" opacity="0.6"/>
    </pattern>
    <pattern id="wa-apron" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
      <rect width="18" height="18" fill="oklch(0.84 0.006 250)"/>
      <line x1="0" y1="9" x2="18" y2="9" stroke="oklch(0.72 0.008 250)" stroke-width="0.6" stroke-dasharray="6 4"/>
    </pattern>
  </defs>

  <!-- SEA -->
  <rect x="0" y="0" width="1800" height="1200" fill="${sea}"/>
  <rect x="0" y="0" width="1800" height="1200" fill="url(#wa-waves)"/>
  <rect x="0" y="0" width="1800" height="1200" fill="url(#wa-waves2)"/>

  <!-- LAND -->
  <path d="M -50 1250 L -50 380
    C 100 370 220 340 320 320 C 400 308 500 280 560 240
    C 600 215 640 200 680 215 C 720 230 720 260 700 290
    C 685 320 660 350 640 360 C 670 360 720 350 780 360
    C 840 372 880 386 940 396 C 1000 405 1060 395 1120 380
    C 1200 360 1260 330 1320 320 C 1360 314 1390 320 1420 348
    C 1450 376 1490 378 1530 372 C 1570 366 1610 374 1660 380
    C 1710 388 1750 410 1850 420 L 1850 1250 Z" fill="${land}"/>
  <path d="M -50 380
    C 100 370 220 340 320 320 C 400 308 500 280 560 240
    C 600 215 640 200 680 215 C 720 230 720 260 700 290
    C 685 320 660 350 640 360 C 670 360 720 350 780 360
    C 840 372 880 386 940 396 C 1000 405 1060 395 1120 380
    C 1200 360 1260 330 1320 320 C 1360 314 1390 320 1420 348
    C 1450 376 1490 378 1530 372 C 1570 366 1610 374 1660 380
    C 1710 388 1750 410 1850 420"
    fill="none" stroke="${M.ink2}" stroke-width="2.2" stroke-linejoin="round"/>

  <!-- sand strip -->
  <path d="M -50 392 C 100 382 220 352 320 332 C 400 320 500 292 560 252
    C 600 227 640 212 680 227 C 720 242 720 272 700 302
    C 685 332 660 362 640 372 C 670 372 720 362 780 372
    C 840 384 880 398 940 408 C 1000 417 1060 407 1120 392
    C 1200 372 1260 342 1320 332 C 1360 326 1390 332 1420 360
    C 1450 388 1490 390 1530 384 C 1570 378 1610 386 1660 392
    C 1710 400 1750 422 1850 432
    L 1850 446 C 1750 436 1710 414 1660 406
    C 1610 400 1570 392 1530 398 C 1490 404 1450 402 1420 374
    C 1390 346 1360 340 1320 346 C 1260 356 1200 386 1120 406
    C 1060 421 1000 431 940 422 C 880 412 840 398 780 386
    C 720 376 670 386 640 386 C 660 376 685 346 700 316
    C 720 286 720 256 680 241 C 640 226 600 241 560 266
    C 500 306 400 334 320 346 C 220 366 100 396 -50 406 Z" fill="${M.sand}"/>

  <!-- Kalarand beach -->
  <path d="M 940 388 L 1010 388 L 1015 408 L 950 410 Z" fill="url(#wa-sand)" stroke="${M.ink}" stroke-width="1.4" stroke-linejoin="round"/>

  <rect x="0" y="0" width="1800" height="1200" fill="url(#wa-grid)"/>

  <!-- DISTRICTS -->
  <path d="M 60 400 C 50 480 80 560 60 660 L 360 640 C 370 540 360 460 400 400 C 280 400 170 400 60 400 Z" fill="${M.d_poh}" opacity="0.85"/>
  <path d="M 465 365 C 465 320 485 285 525 270 C 590 252 660 252 695 275 C 715 295 720 345 695 365 C 650 378 540 378 465 365 Z" fill="${M.d_nob}" opacity="0.92"/>
  <path d="M 400 380 C 470 390 560 390 640 380 C 720 380 770 420 770 500 C 770 580 720 640 640 650 C 540 660 460 640 420 580 C 380 520 380 440 400 380 Z" fill="${M.d_kal}" opacity="0.92"/>
  <path d="M 580 660 C 660 650 740 660 810 700 C 850 740 840 800 790 840 C 730 870 630 870 580 840 C 530 800 530 720 580 660 Z" fill="${M.d_tel}" opacity="0.92"/>
  <path d="M 910 430 C 1000 410 1110 420 1180 460 C 1230 500 1240 590 1210 650 C 1170 710 1080 730 1000 720 C 920 710 870 650 870 560 C 870 490 880 450 910 430 Z" fill="${M.d_old}" opacity="0.95"/>
  <path d="M 880 470 C 900 450 940 450 950 480 C 960 520 940 580 900 590 C 870 590 860 530 880 470 Z" fill="${M.parkLt}" opacity="0.55"/>
  <path d="M 1180 540 C 1260 520 1320 540 1340 600 C 1350 680 1330 780 1280 850 C 1200 920 1100 920 1080 850 C 1060 780 1080 680 1110 600 C 1130 565 1150 545 1180 540 Z" fill="${M.d_kes}" opacity="0.92"/>
  <path d="M 1360 460 C 1440 450 1520 480 1560 530 C 1590 580 1580 670 1530 750 C 1460 810 1380 800 1330 750 C 1300 700 1300 600 1320 530 C 1330 495 1345 470 1360 460 Z" fill="${M.d_kad}" opacity="0.92"/>
  <path d="M 1600 460 C 1680 450 1760 470 1790 510 L 1820 720 C 1780 760 1700 760 1660 720 C 1620 680 1600 590 1600 460 Z" fill="${M.d_pir}" opacity="0.92"/>
  <path d="M 540 880 C 660 870 800 880 920 900 C 1000 910 1080 920 1080 970 C 1080 1010 1000 1020 900 1020 C 800 1020 680 1010 580 1000 C 520 990 500 940 540 880 Z" fill="${M.d_kri}" opacity="0.92"/>

  <!-- PARKS -->
  <path d="M 820 540 C 840 510 870 510 880 540 C 880 580 860 610 830 610 C 800 600 800 570 820 540 Z" fill="${M.park}" stroke="${M.parkDk}" stroke-width="1"/>
  ${grove({ x:810, y:540, w:70, h:70, n:4, seed:3 })}
  <path d="M 1360 510 C 1440 490 1520 525 1550 580 C 1565 640 1535 715 1470 745 C 1400 760 1340 720 1330 670 C 1320 615 1335 555 1360 510 Z" fill="${M.park}" stroke="${M.parkDk}" stroke-width="1.1"/>
  <rect x="1340" y="500" width="220" height="260" fill="url(#wa-parkdots)" opacity="0.35" pointer-events="none"/>
  ${grove({ x:1350, y:520, w:200, h:200, n:11, seed:11 })}
  <path d="M 520 410 C 570 400 610 410 630 440 C 640 470 620 500 580 500 C 540 500 510 480 520 410 Z" fill="${M.parkLt}" stroke="${M.parkDk}" stroke-width="0.9"/>
  ${grove({ x:530, y:420, w:100, h:70, n:5, seed:5 })}
  <path d="M 120 700 C 200 680 280 690 320 720 C 320 760 280 780 220 780 C 160 780 120 750 120 700 Z" fill="${M.park}" stroke="${M.parkDk}" stroke-width="1"/>
  ${grove({ x:130, y:700, w:190, h:80, n:8, seed:9 })}
  ${parkPatch({ x:1170, y:780, w:70, h:40, seed:17 })}
  <path d="M 1620 540 C 1700 530 1770 545 1800 580 C 1800 660 1740 690 1680 690 C 1620 690 1600 620 1620 540 Z" fill="${M.park}" stroke="${M.parkDk}" stroke-width="1.1"/>
  ${grove({ x:1620, y:550, w:170, h:130, n:9, seed:21 })}

  <!-- WATER — ponds / lakes -->
  <ellipse cx="820" cy="660" rx="32" ry="12" fill="${M.sea}" stroke="${M.seaInk}" stroke-width="1" opacity="0.85"/>
  <path d="M 1360 990 C 1410 970 1500 965 1580 985 C 1660 1005 1700 1040 1680 1080 C 1630 1115 1540 1120 1460 1105 C 1380 1090 1330 1040 1360 990 Z" fill="${M.sea}" stroke="${M.seaInk}" stroke-width="1.4" opacity="0.85"/>
  <path d="M 1360 990 C 1410 970 1500 965 1580 985 C 1660 1005 1700 1040 1680 1080 C 1630 1115 1540 1120 1460 1105 C 1380 1090 1330 1040 1360 990 Z" fill="url(#wa-waves)" opacity="0.6"/>

  <!-- RAILWAY -->
  <g stroke="${M.rail}" stroke-width="2" fill="none">
    <path d="M 855 420 C 850 500 820 620 805 760 C 800 860 820 960 850 1100"/>
    <path d="M 868 420 C 863 500 833 620 818 760 C 813 860 833 960 863 1100"/>
  </g>
  ${railTies}

  <!-- MAJOR ROADS -->
  <g stroke="${M.roadEdge}" stroke-width="6" fill="none">
    <path d="M 200 740 C 380 720 580 720 720 720 C 860 720 1000 700 1200 700 C 1340 700 1500 720 1680 760"/>
    <path d="M 950 460 C 980 580 990 700 970 820 C 960 940 940 1020 930 1180"/>
    <path d="M 60 540 C 200 530 360 530 540 540 C 700 550 860 560 1010 560"/>
  </g>
  <g stroke="${M.road}" stroke-width="3" fill="none">
    <path d="M 200 740 C 380 720 580 720 720 720 C 860 720 1000 700 1200 700 C 1340 700 1500 720 1680 760"/>
    <path d="M 950 460 C 980 580 990 700 970 820 C 960 940 940 1020 930 1180"/>
    <path d="M 60 540 C 200 530 360 530 540 540 C 700 550 860 560 1010 560"/>
  </g>
  <!-- Reidi tee -->
  <g stroke="${M.roadEdge}" stroke-width="6" fill="none">
    <path d="M 1020 405 C 1100 420 1200 420 1300 430 C 1400 440 1500 450 1600 460 C 1700 470 1780 490 1820 510"/>
  </g>
  <g stroke="${M.road}" stroke-width="3" fill="none">
    <path d="M 1020 405 C 1100 420 1200 420 1300 430 C 1400 440 1500 450 1600 460 C 1700 470 1780 490 1820 510"/>
  </g>

  <!-- TRAM NETWORK -->
  ${tramLine({ d:"M 100 540 C 220 530 340 530 460 540 C 540 545 600 590 660 650 C 720 720 780 720 830 720 C 880 720 920 760 950 820 C 990 880 1050 920 1120 950 C 1200 980 1280 970 1340 950 C 1400 935 1470 935 1530 960", color:"oklch(0.50 0.12 28)" })}
  ${tramLine({ d:"M 950 820 C 1000 760 1060 700 1100 660", color:"oklch(0.54 0.12 60)" })}
  ${tramLine({ d:"M 1180 700 C 1280 660 1360 620 1440 600", color:"oklch(0.44 0.10 200)" })}

  <!-- OLD TOWN WALL -->
  <path d="M 905 430 C 1000 410 1115 422 1185 462 C 1245 504 1247 596 1205 660 C 1155 716 1065 730 985 718 C 910 706 858 640 868 562 C 874 504 880 452 905 430 Z" fill="none" stroke="${M.rRust}" stroke-width="3.5"/>
  ${wallDots}

  <!-- OLD TOWN LANDMARKS -->
  ${toompeaCastle({ x:910, y:540, scale:0.92 })}
  ${nevskyCathedral({ x:970, y:540, scale:0.9 })}
  ${stOlafChurch({ x:1150, y:490, scale:0.78 })}
  ${townHall({ x:1015, y:640, scale:0.78 })}
  ${oldTownGables}
  ${kiekTower({ x:895, y:700, scale:0.85 })}

  <!-- NOBLESSNER -->
  ${brickFactory({ x:510, y:310, w:48, h:20, fill:M.wRose, label:'Põhjala' })}
  <rect x="490" y="335" width="20" height="8" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4"/>
  ${lennusadam({ x:680, y:310, scale:0.85 })}
  ${igloo({ x:745, y:325, r:6, fill:M.wMint })}
  ${igloo({ x:758, y:328, r:6, fill:M.wPink })}
  ${igloo({ x:770, y:325, r:6, fill:M.wMustard })}
  ${patareiPrison({ x:500, y:345, scale:0.55 })}
  <line x1="720" y1="290" x2="720" y2="250" stroke="${M.ink}" stroke-width="1.4"/>
  <line x1="720" y1="250" x2="735" y2="250" stroke="${M.ink}" stroke-width="1.4"/>
  <line x1="735" y1="250" x2="735" y2="262" stroke="${M.ink}" stroke-width="1.4"/>

  <!-- LINNAHALL + KULTUURIKATEL -->
  ${linnahall({ x:900, y:388, scale:0.7 })}
  ${tinyBldg({ x:840, y:400, w:32, h:18, fill:M.wRose, roof:M.rRust, label:'Kultuurikatel' })}

  <!-- KOPLI -->
  ${kopliHouses}
  ${brickFactory({ x:180, y:650, w:56, h:22, fill:M.wOlive, label:'Põhjala Tehas' })}

  <!-- KALAMAJA -->
  <path d="M 470 460 C 520 480 580 490 640 510" stroke="oklch(0.94 0.020 78)" stroke-width="10" fill="none" stroke-linecap="round"/>
  <path d="M 470 460 C 520 480 580 490 640 510" stroke="${M.roadEdge}" stroke-width="11" fill="none" stroke-linecap="round" opacity="0.5"/>
  <path d="M 470 460 C 520 480 580 490 640 510" stroke="${M.ink}" stroke-width="1" fill="none" stroke-dasharray="1 5" opacity="0.35" stroke-linecap="round"/>
  ${kalamajaHouses}
  ${whiteMuseum({ x:620, y:605, w:40, h:24 })}

  <!-- BALTI JAAM -->
  ${trainStation({ x:770, y:530, scale:0.85 })}

  <!-- TELLISKIVI -->
  ${telliskiviHall({ x:700, y:720, scale:0.95 })}
  ${telliskiviHall({ x:700, y:780, scale:0.7 })}
  <rect x="798" y="682" width="10" height="50" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.4"/>
  <rect x="795" y="678" width="16" height="6" fill="${M.rRust}" stroke="${M.ink}" stroke-width="1.4"/>

  <!-- KESKLINN -->
  ${viruHotel({ x:1240, y:690, scale:0.9 })}
  ${glassTower({ x:1198, y:700, w:20, h:36, fill:M.wSky })}
  ${glassTower({ x:1275, y:690, w:18, h:32, fill:M.wConc })}
  ${brickFactory({ x:1200, y:770, w:50, h:18, fill:M.wRose, label:'Rotermanni' })}
  ${brickFactory({ x:1270, y:780, w:42, h:16, fill:M.wMustard })}
  ${shoppingMall({ x:1130, y:870, w:66, h:26, fill:M.wPink, label:'Stockmann' })}
  <rect x="1075" y="680" width="48" height="36" fill="oklch(0.96 0.010 78)" stroke="${M.ink}" stroke-width="1.4" opacity="0.95"/>
  ${freedomCross({ x:1100, y:715, scale:0.7 })}
  <text x="1100" y="730" text-anchor="middle" font-family="Geist Mono,monospace" font-size="9" font-weight="600" fill="${M.ink}" stroke="white" stroke-width="3" paint-order="stroke">Vabaduse väljak</text>

  <!-- KADRIORG -->
  ${kadriorgPalace({ x:1390, y:620, scale:0.95 })}
  ${kumuMuseum({ x:1500, y:700, scale:0.85 })}

  <!-- PIRITA -->
  ${tvTower({ x:1680, y:620, scale:1 })}
  <rect x="1700" y="420" width="36" height="5" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4"/>
  <polygon points="1715,418 1721,408 1727,418" fill="${M.wPink}" stroke="${M.ink}" stroke-width="1.2" stroke-linejoin="round"/>
  <polygon points="1730,418 1736,406 1742,418" fill="${M.wMint}" stroke="${M.ink}" stroke-width="1.2" stroke-linejoin="round"/>
  ${house({ x:1660, y:730, w:28, h:18, fill:M.wMint, roof:M.rRust, pitch:0.55 })}
  ${house({ x:1720, y:735, w:26, h:18, fill:M.wPink, roof:M.rRust, pitch:0.55 })}

  <!-- KRISTIINE -->
  ${shoppingMall({ x:580, y:920, w:80, h:26, fill:M.wMustard, label:'Kristiine Keskus' })}
  ${brickFactory({ x:770, y:950, w:50, h:20, fill:M.wRose })}
  ${brickFactory({ x:870, y:960, w:42, h:18, fill:M.wOlive })}
  ${house({ x:1010, y:945, w:32, h:20, fill:M.wSky, roof:M.rRust, pitch:0.55 })}

  <!-- AIRPORT + ÜLEMISTE -->
  <rect x="1450" y="950" width="160" height="26" fill="url(#wa-apron)" stroke="${M.ink}" stroke-width="1.4"/>
  <rect x="1527" y="962" width="46" height="18" rx="3" fill="${M.wConc}" stroke="${M.ink}" stroke-width="1.4"/>
  <text x="1550" y="990" text-anchor="middle" font-family="Geist Mono,monospace" font-size="10" font-weight="600" fill="${M.ink}" stroke="white" stroke-width="3" paint-order="stroke">Lennart Meri</text>
  ${glassTower({ x:1310, y:940, w:20, h:40, fill:M.wConc })}
  ${glassTower({ x:1342, y:945, w:18, h:32, fill:M.wSky })}
  ${glassTower({ x:1370, y:935, w:22, h:46, fill:M.wConc })}
  ${shoppingMall({ x:1300, y:1010, w:70, h:20, fill:M.wPink, label:'Ülemiste Centre' })}
  ${ferrisWheel({ x:1240, y:950, r:26, scale:1 })}
  <text x="1240" y="998" text-anchor="middle" font-family="Geist Mono,monospace" font-size="10" font-weight="600" fill="${M.ink}" stroke="white" stroke-width="3" paint-order="stroke">SkyWheel</text>

  <!-- FERRY + BUS -->
  ${ferryIcon({ x:1050, y:385 })}
  ${busStation({ x:1240, y:840 })}

  <!-- TRAM CARS -->
  ${tramCar({ x:550, y:538, color:"oklch(0.50 0.12 28)" })}
  ${tramCar({ x:880, y:720, color:"oklch(0.50 0.12 28)" })}
  ${tramCar({ x:1380, y:596, color:"oklch(0.44 0.10 200)" })}

  <!-- TREES -->
  ${conifer({ cx:350, baseY:400, h:26, w:14 })}
  ${conifer({ cx:300, baseY:440, h:22, w:12 })}
  ${conifer({ cx:870, baseY:760, h:24, w:12 })}
  ${tree({ cx:930, cy:580, r:9 })}
  ${tree({ cx:1170, cy:520, r:9 })}

  <!-- LABELS -->
  <g style="pointer-events:none">
    ${districtLabels}
    ${landmarkLabels}
    ${freeLabels}
  </g>

  <!-- COMPASS ROSE -->
  <g transform="translate(1700,90)">
    <circle r="34" fill="rgba(255,255,255,0.7)" stroke="${M.ink}" stroke-width="1.5"/>
    <polygon points="0,-22 8,8 0,2 -8,8" fill="${M.hi}" stroke="${M.ink}" stroke-width="1.2" stroke-linejoin="round"/>
    <text x="0" y="-6" text-anchor="middle" font-family="Geist Mono,monospace" font-size="11" font-weight="600" fill="${M.ink}">N</text>
  </g>
</svg>`;
};
