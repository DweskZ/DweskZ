// Generates the profile banners as animated ASCII SVGs.
//
//   node scripts/build-banners.mjs
//
// The drawing is a port of the portfolio's "Mar de Manta" hero (ascii-seascape.ts) and footer
// horizon (ascii-horizon / ascii-sea.ts): horizon, perspective swell, a half-set vermilion sun
// with a flickering reflection, and a sky that is night (stars) or day (clouds and gulls).
// Motion is baked as a short loop of frames switched with CSS, so the files need no script.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAU = Math.PI * 2;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const DISPLAY = "Inter, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

// Sumi (dark) and Washi (light) tokens, copied from the portfolio's base.css.
const THEMES = {
  dark: {
    bg: '#161412',
    ink: '#ece5d6',
    soft: '#bfb7a7',
    muted: '#8b8478',
    art: '#d9d2c3',
    dim: '#6f6a60',
    line: '#e8e2d4',
    seal: '#e0644a',
    dark: true,
  },
  light: {
    bg: '#f3ecdb',
    ink: '#1d1b17',
    soft: '#4d4840',
    muted: '#807a6e',
    art: '#1f1c18',
    dim: '#8f8676',
    line: '#141414',
    seal: '#b8432b',
    dark: false,
  },
};

// Glyph size per banner: the header matches the site's dense hero, the footer its larger strip.
const HEADER_FONT = 10;
const FOOTER_FONT = 12;

/** Deterministic PRNG so rebuilding gives the same sky. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(a, b, c = 0) {
  let h = Math.imul(a + 374761393, 668265263) ^ Math.imul(b + 1274126177, 2246822519);
  h = Math.imul(h ^ (c + 1013904223), 3266489917);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n) => String(Math.round(n * 100) / 100);

/** A grid of single glyphs; rows are flushed as one <text> per contiguous band. */
class Layer {
  constructor(cols, rows, font) {
    this.cols = cols;
    this.font = font;
    this.cw = font * 0.6;
    this.cells = Array.from({ length: rows }, () => new Array(cols).fill(' '));
  }
  put(x, y, glyph) {
    if (y < 0 || y >= this.cells.length || x < 0 || x >= this.cols) return;
    this.cells[y][x] = glyph;
  }
  count() {
    return this.cells.reduce((n, row) => n + row.filter((g) => g !== ' ').length, 0);
  }
  /** One <text> per row, trimmed; textLength pins the advance so any monospace font lines up. */
  toSvg(rowHeight, attrsForRow) {
    const out = [];
    this.cells.forEach((row, y) => {
      const line = row.join('');
      const start = line.search(/\S/);
      if (start < 0) return;
      const text = line.trimEnd().slice(start);
      const length = text.length > 1 ? ` textLength="${num(text.length * this.cw)}"` : '';
      const attrs = attrsForRow ? attrsForRow(y) : '';
      out.push(
        `<text x="${num(start * this.cw)}" y="${num(y * rowHeight + this.font * 0.82)}"${length}${attrs}>${esc(text)}</text>`,
      );
    });
    return out.join('');
  }
}

function frameStyle(index, frames, seconds) {
  const delay = index === 0 ? 0 : -(seconds - (index * seconds) / frames);
  return `animation-delay:${num(delay)}s`;
}

function baseCss(frames, seconds, FONT) {
  const slice = num(100 / frames);
  return `
text{font-family:${MONO};font-size:${FONT}px;font-weight:500;white-space:pre}
.fr{opacity:0;animation:fr ${seconds}s step-end infinite}
.fr0{opacity:1}
@keyframes fr{0%{opacity:1}${slice}%{opacity:0}100%{opacity:0}}
.tw{animation:tw 5s ease-in-out infinite}
@keyframes tw{0%,100%{opacity:.14}50%{opacity:.85}}
.sun{animation:sun 9s ease-in-out infinite}
@keyframes sun{0%,100%{opacity:1}50%{opacity:.9}}
.drift{animation:drift 46s ease-in-out infinite alternate}
@keyframes drift{from{transform:translateX(-14px)}to{transform:translateX(22px)}}
@media (prefers-reduced-motion:reduce){.fr,.tw,.sun,.drift{animation:none}.fr{opacity:0}.fr0{opacity:1}.tw{opacity:.6}}`;
}

// ---------------------------------------------------------------------------------------------
// Header: the hero seascape with name, role and HUD line.
// ---------------------------------------------------------------------------------------------

function buildHeader(theme) {
  const p = THEMES[theme];
  const W = 1200;
  const H = 420;
  const FONT = HEADER_FONT;
  const CW = FONT * 0.6;
  const CH = FONT * 1.05;
  const layer = () => new Layer(cols, rows, FONT);
  const cols = Math.floor(W / CW);
  const rows = Math.floor(H / CH);
  const horizon = Math.floor(rows * 0.5);
  const sunX = cols * 0.74;
  const radius = rows * 0.17;
  const boost = p.dark ? 1 : 1.55;
  const FRAMES = 24;
  const SECONDS = 3.6;
  let letters = 0;
  const parts = [];

  // Sky.
  if (p.dark) {
    const rand = mulberry32(20261115);
    const count = Math.floor(cols * horizon * 0.012);
    const stars = [];
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rand() * cols);
      const y = Math.floor(rand() * Math.max(1, horizon - 2));
      const bright = rand() > 0.72;
      const duration = 2.6 + rand() * 4.6;
      const delay = -rand() * 7;
      stars.push(
        `<text class="tw" x="${num(x * CW)}" y="${num(y * CH + FONT * 0.82)}" style="animation-duration:${num(duration)}s;animation-delay:${num(delay)}s">${bright ? '+' : '·'}</text>`,
      );
    }
    letters += count;
    parts.push(`<g fill="${p.dim}">${stars.join('')}</g>`);
  } else {
    // Daytime: soft cloud bands, plus a few gulls.
    const t = 38;
    const strong = layer();
    const faint = layer();
    for (let k = 0; k < 4; k++) {
      const cy = Math.floor(horizon * (0.18 + k * 0.17));
      const cx = (((k * 0.31 + t * 0.004 * (k + 1)) % 1.3) - 0.15) * cols;
      const len = cols * (0.12 + k * 0.03);
      for (let x = Math.floor(cx); x < cx + len; x++) {
        const e = 1 - Math.abs((x - cx) / len - 0.5) * 2;
        // Keep the top-left corner clear for the location tag.
        if (x * CW < 500 && cy * CH < 78) continue;
        (e > 0.6 ? strong : faint).put(x, cy, e > 0.6 ? '~' : '-');
        if (e > 0.45) faint.put(x, cy + 1, '-');
      }
    }
    letters += strong.count() + faint.count();
    parts.push(
      `<g class="drift" fill="${p.dim}"><g fill-opacity=".5">${strong.toSvg(CH)}</g><g fill-opacity=".3">${faint.toSvg(CH)}</g></g>`,
    );
    const gulls = layer();
    for (let k = 0; k < 5; k++) {
      const gx = Math.floor(((k * 0.23 + t * 0.012 * (1 + k * 0.2)) % 1.1) * cols);
      const gy = Math.floor(horizon * (0.25 + 0.12 * Math.sin(k * 2 + t * 0.4)) + k * 2);
      gulls.put(gx, Math.min(gy, horizon - 2), 'v');
    }
    letters += gulls.count();
    parts.push(`<g fill="${p.art}" fill-opacity=".75">${gulls.toSvg(CH)}</g>`);
  }

  // Sun: half disc above the horizon, denser glyphs toward the core, banded near the water.
  const cy = horizon - radius * 0.35 + radius * 0.06;
  const sun = {
    '@': [layer(), layer()],
    '#': [layer(), layer()],
    '*': [layer(), layer()],
  };
  for (let y = Math.floor(cy - radius); y < horizon; y++) {
    for (let x = Math.floor(sunX - radius * 2.2); x < sunX + radius * 2.2; x++) {
      const d = Math.hypot(((x - sunX) * CW) / CH, y - cy) / radius;
      if (d > 1) continue;
      const glyph = d < 0.5 ? '@' : d < 0.8 ? '#' : '*';
      const banded = y % 3 === 0 && y > cy ? 1 : 0;
      sun[glyph][banded].put(x, y, glyph);
    }
  }
  const sunAlpha = { '@': 0.87, '#': 0.71, '*': 0.6 };
  const sunSvg = Object.entries(sun)
    .flatMap(([glyph, [full, banded]]) => {
      letters += full.count() + banded.count();
      const a = Math.min(1, sunAlpha[glyph] * (p.dark ? 1 : 1.3));
      return [
        `<g fill-opacity="${num(a)}">${full.toSvg(CH)}</g>`,
        `<g fill-opacity="${num(a * 0.35)}">${banded.toSvg(CH)}</g>`,
      ];
    })
    .join('');
  parts.push(`<g class="sun" fill="${p.seal}">${sunSvg}</g>`);

  // Water: small waves near the horizon, big near the bottom, with the sun's reflection.
  const waterFrames = [];
  let waterLetters = 0;
  for (let i = 0; i < FRAMES; i++) {
    const water = layer();
    const glint = layer();
    for (let y = horizon + 1; y < rows; y++) {
      const depth = (y - horizon) / Math.max(1, rows - horizon);
      const freq = 0.22 - depth * 0.14;
      // Whole turns per loop so the last frame meets the first: faster toward the viewer.
      const turns = depth < 0.34 ? 1 : depth < 0.67 ? 2 : 3;
      for (let x = 0; x < cols; x++) {
        const ph = x * freq + y * 0.9;
        const h =
          Math.sin(ph - (TAU * i * turns) / FRAMES) +
          0.5 * Math.sin(ph * 2.3 + y - (TAU * i * (turns + 1)) / FRAMES);
        const g = h > 1.15 ? '^' : h > 0.7 ? '~' : h > 0.1 ? '-' : h > -0.6 ? '_' : ' ';
        if (g === ' ') continue;
        const inReflection =
          Math.abs(x - sunX) < radius * 1.6 * (1 - depth * 0.5) &&
          Math.sin(x * 1.7 + y * 2.9 + (TAU * i * 3) / FRAMES) > -0.2 + depth * 0.9;
        if (inReflection && y < horizon + (rows - horizon) * 0.8) glint.put(x, y, g);
        else water.put(x, y, g);
      }
    }
    if (i === 0) waterLetters = water.count() + glint.count();
    const depthOf = (y) => (y - horizon) / Math.max(1, rows - horizon);
    const waterSvg = water.toSvg(
      CH,
      (y) => ` fill-opacity="${num(Math.min(1, (0.25 + depthOf(y) * 0.6) * boost))}"`,
    );
    const glintSvg = glint.toSvg(
      CH,
      (y) => ` fill-opacity="${num(Math.min(1, (0.85 - depthOf(y) * 0.5) * (p.dark ? 1 : 1.2)))}"`,
    );
    waterFrames.push(
      `<g class="fr${i === 0 ? ' fr0' : ''}" style="${frameStyle(i, FRAMES, SECONDS)}"><g fill="${p.art}">${waterSvg}</g><g fill="${p.seal}">${glintSvg}</g></g>`,
    );
  }
  letters += waterLetters;
  parts.push(waterFrames.join(''));

  // Horizon line.
  const line = layer();
  for (let x = 0; x < cols; x++) line.put(x, horizon, Math.abs(x - sunX) < radius * 2 ? '=' : '-');
  letters += line.count();
  parts.push(`<g fill="${p.art}" fill-opacity=".9">${line.toSvg(CH)}</g>`);

  const label =
    'Luis Emilio Figueroa Arteaga. AI and Full-Stack Engineer. Manta, Ecuador. An ASCII seascape: a vermilion sun setting over the sea.';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
<title>${label}</title>
<style>${baseCss(FRAMES, SECONDS, FONT)}
.name{font-family:${DISPLAY};font-weight:900;font-size:58px;letter-spacing:-1.2px}
.role{font-size:22px;font-weight:500}
.tag{font-size:17px;font-weight:500}
.hud{font-size:15px;font-weight:500}
</style>
<defs>
<clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath>
<linearGradient id="scrim" x1="0" y1="1" x2="0.78" y2="0">
<stop offset="0" stop-color="${p.bg}" stop-opacity=".96"/>
<stop offset=".42" stop-color="${p.bg}" stop-opacity=".78"/>
<stop offset=".74" stop-color="${p.bg}" stop-opacity="0"/>
</linearGradient>
</defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${H}" fill="${p.bg}"/>
<g transform="translate(2 2)">${parts.join('\n')}</g>
<rect width="${W}" height="${H}" fill="url(#scrim)"/>
<text class="tag" x="44" y="54" fill="${p.soft}"><tspan fill="${p.seal}">●</tspan> Manta, Ecuador · open to relocation or remote</text>
<text class="name" x="42" y="262" fill="${p.ink}">Luis Emilio</text>
<text class="name" x="42" y="322" fill="${p.seal}">Figueroa Arteaga</text>
<text class="role" x="44" y="360" fill="${p.soft}"><tspan fill="${p.seal}">▸ </tspan>AI &amp; Full-Stack Engineer<tspan fill="${p.muted}"> · @DweskZ</tspan></text>
<text class="hud" x="44" y="398" fill="${p.muted}">@dweskz · 2026 · <tspan fill="${p.soft}" font-weight="600">manta.sea</tspan></text>
<text class="hud" x="${W - 44}" y="398" text-anchor="end" fill="${p.muted}">letters <tspan fill="${p.soft}" font-weight="600">${letters}</tspan></text>
</g>
</svg>
`;
}

// ---------------------------------------------------------------------------------------------
// Footer: the thin sea-horizon strip.
// ---------------------------------------------------------------------------------------------

function seaRowAlpha(row, rows) {
  if (rows <= 1) return 0.8;
  return 0.18 + 0.72 * (row / (rows - 1));
}

function buildFooter(theme) {
  const p = THEMES[theme];
  const W = 1200;
  const H = 104;
  const FONT = FOOTER_FONT;
  const CW = FONT * 0.6;
  const CH = FONT;
  const layer = () => new Layer(cols, rows, FONT);
  const cols = Math.floor(W / CW);
  const rows = Math.floor((H - 8) / CH);
  const horizon = Math.max(2, Math.floor(rows * 0.5));
  const seaRows = rows - horizon;
  const sunCol = cols * 0.82;
  const sunRadius = horizon - 0.3;
  const FRAMES = 16;
  const SECONDS = 2.4;

  // Half-set sun sitting on the horizon.
  const sun = layer();
  for (let row = 0; row < horizon; row++) {
    const dy = horizon - row - 0.5;
    if (dy > sunRadius) continue;
    const half = Math.sqrt(sunRadius * sunRadius - dy * dy) * (CH / CW);
    for (let col = Math.ceil(sunCol - half); col <= Math.floor(sunCol + half); col++) {
      const edge = Math.abs(col - sunCol) / Math.max(half, 1);
      sun.put(col, row, edge > 0.82 || dy > sunRadius * 0.8 ? '+' : dy < sunRadius * 0.45 ? '@' : '#');
    }
  }

  // Sea rows, fading out toward the horizon, with the sun's reflection in vermilion.
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const near = layer();
    const far = layer();
    const glint = layer();
    for (let d = 0; d < seaRows; d++) {
      const row = horizon + d;
      const reflect = 2 + d * 0.9;
      const turns = d < seaRows / 2 ? 1 : 2;
      for (let col = 0; col < cols; col++) {
        if (Math.abs(col - sunCol) < reflect && hash01(col, d, i) > 0.45) {
          glint.put(col, row, d % 2 === 0 ? '=' : '-');
          continue;
        }
        const swell =
          Math.sin(col * 0.33 - (TAU * i * turns) / FRAMES + d * 1.7) +
          0.55 * Math.sin(col * 0.11 + (TAU * i) / FRAMES - d * 0.9);
        const g = swell > 1.1 ? '^' : swell > 0.35 ? '~' : swell > -0.5 ? '-' : '_';
        (d < seaRows / 2 ? far : near).put(col, row, g);
      }
    }
    const alpha = (y) => seaRowAlpha(y - horizon, seaRows) * 0.7;
    frames.push(
      `<g class="fr${i === 0 ? ' fr0' : ''}" style="${frameStyle(i, FRAMES, SECONDS)}">` +
        `<g fill="${p.muted}">${far.toSvg(CH, (y) => ` fill-opacity="${num(alpha(y))}"`)}</g>` +
        `<g fill="${p.line}">${near.toSvg(CH, (y) => ` fill-opacity="${num(alpha(y))}"`)}</g>` +
        `<g fill="${p.seal}">${glint.toSvg(CH, (y) => ` fill-opacity="${num(Math.min(1, alpha(y) + 0.15))}"`)}</g>` +
        `</g>`,
    );
  }

  const label = 'DWESK. Build systems, learn deeply, iterate fast.';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
<title>${label}</title>
<style>${baseCss(FRAMES, SECONDS, FONT)}
.motto{font-size:16px;font-weight:500}
</style>
<defs><clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath></defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${H}" fill="${p.bg}"/>
<g transform="translate(2 6)">
<g class="sun" fill="${p.seal}" fill-opacity=".95">${sun.toSvg(CH)}</g>
${frames.join('\n')}
</g>
<text class="motto" x="44" y="38" fill="${p.muted}"><tspan fill="${p.soft}" font-weight="600">DWESK</tspan> — build systems, learn deeply, iterate fast</text>
</g>
</svg>
`;
}

mkdirSync(join(ROOT, 'assets'), { recursive: true });
for (const theme of Object.keys(THEMES)) {
  for (const [name, build] of [
    ['header', buildHeader],
    ['footer', buildFooter],
  ]) {
    const file = join(ROOT, 'assets', `${name}-${theme}.svg`);
    const svg = build(theme);
    writeFileSync(file, svg);
    console.log(`${name}-${theme}.svg  ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`);
  }
}
