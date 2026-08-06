/**
 * SHOTPlan's main screen: menu bar, detonator bar, plot area, status line.
 *
 * Layout is taken from screenshots of v3.0 running under DOSBox, on the 80x30
 * character grid the VGA 8x16 font gives us. Where a measurement is a guess
 * rather than a reading, it is marked TODO so it can be checked against a
 * screenshot rather than quietly becoming canon.
 */
import {
  WIDTH, HEIGHT, BLACK, BLUE, CYAN, WHITE, YELLOW, LIGHTGREEN, LIGHTCYAN,
  LIGHTMAGENTA, LIGHTGREY, GREEN, MAGENTA,
} from './screen.js';
import { liveHoles, dummyHoles, planBounds } from '../format/xel.js';

const MENUS = [
  { label: 'Files', hot: 0 },
  { label: 'Edit', hot: 0 },
  { label: 'Calculations', hot: 0 },
  { label: 'Show', hot: 0 },
  { label: 'Print/Plot', hot: 0 },
  { label: 'Options', hot: 0 },
  { label: 'Quit', hot: 0 },
];

/** Menu bar. Hotkey letters render yellow, everything else white on blue. */
export function drawMenuBar(s, active = -1) {
  s.fillRect(0, 0, WIDTH - 1, 15, BLUE);
  let col = 0;
  MENUS.forEach((m, i) => {
    const x = col * 8;
    const bg = i === active ? CYAN : BLUE;
    if (i === active) s.fillRect(x, 0, x + m.label.length * 8 - 1, 15, bg);
    s.text(m.label, x, 0, WHITE, bg);
    // hotkey highlight
    s.glyph(m.label.charCodeAt(m.hot), x + m.hot * 8, 0, YELLOW, bg);
    col += m.label.length + 2;
  });
}

/**
 * Detonator bar — eight surface-detonator slots, each with a coloured
 * connector glyph and its product name (or "Not Def.").
 */
export function drawDetonatorBar(s, plan) {
  s.fillRect(0, 16, WIDTH - 1, 31, BLUE);
  const colours = [WHITE, LIGHTGREEN, LIGHTCYAN, WHITE, LIGHTMAGENTA, YELLOW, LIGHTGREY, LIGHTGREY];
  const surface = plan ? plan.detonators.filter((d) => d.kind === 'surface') : [];
  for (let i = 0; i < 8; i++) {
    const x = i * 10 * 8;
    const d = surface[i];
    const name = d && d.defined ? d.description : 'Not Def.';
    // connector glyph: a short arrow, drawn as CP437 box/arrow characters
    s.glyph(0x1a, x, 16, colours[i], BLUE); // right arrow
    s.text(name.slice(0, 8), x + 8, 16, colours[i], BLUE);
  }
}

/** Status line: filename, plan title, copyright. */
export function drawStatusBar(s, filename, title) {
  const y = HEIGHT - 16;
  s.fillRect(0, y, WIDTH - 1, HEIGHT - 1, BLUE);
  s.text((filename || '').slice(0, 14), 0, y, WHITE, BLUE);
  s.text((title || '').slice(0, 32), 15 * 8, y, WHITE, BLUE);
  s.text('Copyright 1993 IES P/L', WIDTH - 22 * 8, y, WHITE, BLUE);
}

/** Plot area geometry, in pixels. */
export const PLOT = { x0: 8, y0: 36, x1: WIDTH - 9, y1: HEIGHT - 22 };

/** A dotted border, as the original draws around the plan area. */
function dottedRect(s, x0, y0, x1, y1, c) {
  for (let x = x0; x <= x1; x += 2) { s.px(x, y0, c); s.px(x, y1, c); }
  for (let y = y0; y <= y1; y += 2) { s.px(x0, y, c); s.px(x1, y, c); }
}

/**
 * Build a world->screen transform that fits the plan into the plot area
 * while preserving aspect. Northing increases up, so Y is flipped.
 */
export function fitTransform(bounds, pad = 12) {
  if (!bounds) return null;
  const w = PLOT.x1 - PLOT.x0 - pad * 2;
  const h = PLOT.y1 - PLOT.y0 - pad * 2;
  const de = Math.max(1e-6, bounds.maxE - bounds.minE);
  const dn = Math.max(1e-6, bounds.maxN - bounds.minN);
  const scale = Math.min(w / de, h / dn);
  const ox = PLOT.x0 + pad + (w - de * scale) / 2;
  const oy = PLOT.y0 + pad + (h - dn * scale) / 2;
  return {
    scale,
    x: (e) => Math.round(ox + (e - bounds.minE) * scale),
    y: (n) => Math.round(oy + h - (n - bounds.minN) * scale - (h - dn * scale)),
  };
}

/**
 * Draw the plan: boundary, benches, surface ties, holes, text annotations.
 *
 * Layer order matters — the original draws ties beneath holes so collars stay
 * legible where lines converge.
 */
export function drawPlan(s, plan, opts = {}) {
  const show = {
    ties: true, benches: true, boundary: true, texts: true,
    collarsOnly: false, ...opts,
  };

  s.fillRect(PLOT.x0, PLOT.y0, PLOT.x1, PLOT.y1, BLACK);
  dottedRect(s, PLOT.x0, PLOT.y0, PLOT.x1, PLOT.y1, BLUE);
  if (!plan) return;

  const t = fitTransform(planBounds(plan));
  if (!t) return;

  s.setClip(PLOT.y0 + 1, PLOT.y1);

  // --- boundary polygon ---
  if (show.boundary && plan.boundary.length > 1) {
    for (let i = 0; i < plan.boundary.length; i++) {
      const a = plan.boundary[i];
      const b = plan.boundary[(i + 1) % plan.boundary.length];
      if (a.e === null || b.e === null) continue;
      s.line(t.x(a.e), t.y(a.n), t.x(b.e), t.y(b.n), BLUE);
    }
  }

  // --- benches: crest and foot polylines ---
  if (show.benches) {
    for (const bench of plan.benches) {
      for (const [pts, colour] of [[bench.crest, BROWNISH()], [bench.foot, GREEN]]) {
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1];
          if (a.e === null || b.e === null) continue;
          s.line(t.x(a.e), t.y(a.n), t.x(b.e), t.y(b.n), colour);
        }
      }
    }
  }

  // --- surface ties ---
  const byIndex = new Map(plan.holes.map((h) => [h.index + 1, h])); // links are 1-based
  if (show.ties) {
    for (const l of plan.links) {
      const a = byIndex.get(l.hole1);
      const b = byIndex.get(l.hole2);
      if (!a || !b || a.e === null || b.e === null) continue;
      s.line(t.x(a.e), t.y(a.n), t.x(b.e), t.y(b.n), YELLOW);
    }
  }

  // --- holes ---
  const r = Math.max(2, Math.min(4, Math.round(t.scale * 0.9)));
  for (const h of dummyHoles(plan)) {
    if (h.e === null) continue;
    s.circle(t.x(h.e), t.y(h.n), r, LIGHTGREY);
  }
  for (const h of liveHoles(plan)) {
    if (h.e === null) continue;
    const x = t.x(h.e), y = t.y(h.n);
    s.fillCircle(x, y, r, BLACK);
    s.circle(x, y, r, WHITE);
  }

  // --- text annotations ---
  if (show.texts) {
    for (const tx of plan.texts) {
      if (tx.e === null) continue;
      s.text(tx.text, t.x(tx.e) + 4, t.y(tx.n) - 8, LIGHTCYAN);
    }
  }

  s.resetClip();
}

// The original's bench crest colour is a warm tone; brown reads closest on the
// EGA palette. TODO: confirm against a screenshot with benches displayed.
function BROWNISH() {
  return 6;
}

/** Draw the whole screen. */
export function drawScreen(s, plan, filename, opts) {
  s.clear(CYAN);
  drawMenuBar(s, opts?.activeMenu ?? -1);
  drawDetonatorBar(s, plan);
  drawPlan(s, plan, opts);
  drawStatusBar(s, filename, plan?.title ?? '');
}
