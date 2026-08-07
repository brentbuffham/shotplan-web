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
  LIGHTMAGENTA, LIGHTGREY, DARKGREY, GREEN, MAGENTA, BROWN, RED, LIGHTRED, LIGHTBLUE,
} from './screen.js';
import { liveHoles, dummyHoles, planBounds } from '../format/xel.js';
import { BURST, BURST_W, BURST_H } from './burst-sprite.js';
import { histogram, envelopeSummary, holesInSlice } from '../calc/envelope.js';
import { BANDS, bandOf } from '../calc/overlap.js';
import { contours, firstMovement } from '../calc/contour.js';

const MENUS = [
  { label: 'Files', hot: 0 },
  { label: 'Edit', hot: 0 },
  { label: 'Calculations', hot: 0 },
  { label: 'Show', hot: 0 },
  { label: 'Print/Plot', hot: 0 },
  { label: 'Options', hot: 0 },
  { label: 'Quit', hot: 0 },
];

/**
 * Menu bar. Hotkey letters render yellow and underlined; the active menu
 * inverts to yellow-on-blue.
 *
 * Measured from a 1x screenshot: one leading column, then four spaces between
 * labels. That puts "Quit" ending around column 71, which is what the original
 * does — a two-space gap only reaches column 56.
 */
const MENU_START = 1;
const MENU_GAP = 4;

export function drawMenuBar(s, active = -1) {
  s.fillRect(0, 0, WIDTH - 1, 15, BLUE);
  let col = MENU_START;
  MENUS.forEach((m, i) => {
    const x = col * 8;
    // The open menu's title turns yellow; the rest stay white. Hotkeys are
    // marked by underline only, not by colour.
    const fg = i === active ? YELLOW : WHITE;
    s.text(m.label, x, 0, fg, BLUE);
    const hx = x + m.hot * 8;
    s.hline(hx, hx + 7, 14, fg);
    col += m.label.length + MENU_GAP;
  });
}

/**
 * Detonator bar — eight surface-detonator slots, each with a coloured
 * connector glyph and its product name (or "Not Def.").
 */
export function drawDetonatorBar(s, plan) {
  s.fillRect(0, 16, WIDTH - 1, 31, BLUE);
  // Each slot previews the tie-line style it draws with: a short line segment
  // in that detonator's colour, then the product name. CP437 0xC4 is the
  // single horizontal box-drawing rule.
  const colours = [WHITE, GREEN, LIGHTGREEN, WHITE, LIGHTMAGENTA, LIGHTCYAN, BROWN, LIGHTGREY];
  const surface = plan ? plan.detonators.filter((d) => d.kind === 'surface') : [];
  for (let i = 0; i < 8; i++) {
    const x = i * 10 * 8;
    const d = surface[i];
    const name = d && d.defined ? d.description : 'Not Def.';
    const c = colours[i % colours.length];
    s.glyph(0xc4, x, 16, c, BLUE);
    s.glyph(0xc4, x + 8, 16, c, BLUE);
    s.text(name.slice(0, 8), x + 16, 16, c, BLUE);
  }
}

/**
 * Status line: filename, plan title, copyright — or a transient message,
 * which takes the whole line as the original's prompts do.
 */
export function drawStatusBar(s, filename, title, status) {
  const y = HEIGHT - 16;
  s.fillRect(0, y, WIDTH - 1, HEIGHT - 1, BLUE);
  if (status) {
    s.text(status.slice(0, 80), 0, y, YELLOW, BLUE);
    return;
  }
  s.text((filename || '').slice(0, 14), 0, y, WHITE, BLUE);
  s.text((title || '').slice(0, 32), 15 * 8, y, WHITE, BLUE);
  s.text('Copyright 1993 IES P/L', WIDTH - 22 * 8, y, WHITE, BLUE);
}

/**
 * Plot area geometry.
 *
 * The original frames the plan in a thick white rectangle sitting on the cyan
 * desktop, with black inside — not a dotted border. Measured off a screenshot
 * of v3.0: the frame insets roughly 16px horizontally, starts at y=48 (just
 * below the detonator bar) and ends around y=440, leaving a cyan band above
 * the status line.
 */
/**
 * Per-detonator-type colours, shared by the tie lines and the detonator bar
 * slots that preview them. Indexed by a link's `type` field.
 * Provisional beyond type 4, which is confirmed magenta from TEST3.XEL.
 */
export const TIE_COLOURS = [
  WHITE, GREEN, YELLOW, LIGHTGREEN, LIGHTMAGENTA, LIGHTCYAN, BROWN, LIGHTGREY,
];

export const FRAME = { x0: 16, y0: 48, x1: WIDTH - 17, y1: 440 };
const FRAME_THICKNESS = 3;

/** Black drawing surface inside the white frame. */
export const PLOT = {
  x0: FRAME.x0 + FRAME_THICKNESS,
  y0: FRAME.y0 + FRAME_THICKNESS,
  x1: FRAME.x1 - FRAME_THICKNESS,
  y1: FRAME.y1 - FRAME_THICKNESS,
};

/**
 * Scale bar, bottom-right inside the plot: a distance label and a bracketed
 * rule. The original picks a round distance and sizes the rule to match.
 */
function drawScaleBar(s, t) {
  if (!t) return;
  // Choose a round world distance that renders 40..120 px wide.
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  let metres = nice[nice.length - 1];
  for (const m of nice) {
    if (m * t.scale >= 40) { metres = m; break; }
  }
  const w = Math.round(metres * t.scale);
  const y = PLOT.y1 - 10;
  const x1 = PLOT.x1 - 10;
  const x0 = x1 - w;
  // Yellow, as v3.0 draws it.
  s.hline(x0, x1, y, YELLOW);
  s.vline(x0, y - 4, y + 4, YELLOW);
  s.vline(x1, y - 4, y + 4, YELLOW);
  const label = `${metres}m`;
  s.text(label, x0 - label.length * 8 - 6, y - 7, YELLOW);
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
    // Northing increases up, screen y increases down, so flip about maxN.
    y: (n) => Math.round(oy + (bounds.maxN - n) * scale),
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

  // The frame states what mode the view is in, and v3.0 uses two distinct
  // treatments: a solid white frame on a cyan desktop for Overview, and a
  // dashed frame on blue once you are zoomed in. Both the frame style and the
  // desktop colour change, so the mode is readable at a glance.
  const overview = opts.isOverview !== false;
  s.fillRect(FRAME.x0 - 8, FRAME.y0 - 8, FRAME.x1 + 8, FRAME.y1 + 8,
             overview ? CYAN : BLUE);
  if (overview) {
    s.fillRect(FRAME.x0, FRAME.y0, FRAME.x1, FRAME.y1, WHITE);
  } else {
    dashedRect(s, FRAME.x0, FRAME.y0, FRAME.x1, FRAME.y1, WHITE);
    dashedRect(s, FRAME.x0 + 1, FRAME.y0 + 1, FRAME.x1 - 1, FRAME.y1 - 1, WHITE);
  }
  s.fillRect(PLOT.x0, PLOT.y0, PLOT.x1, PLOT.y1, BLACK);
  if (!plan) return;

  // A viewport transform wins when navigation is active; otherwise fit.
  const t = opts.transform ?? fitTransform(planBounds(plan));
  if (!t) return;

  s.setClip(PLOT.x0, PLOT.y0, PLOT.x1, PLOT.y1);

  // --- gridlines ---
  // A survey grid with its coordinates labelled, as v3.0 draws in edit mode.
  // The step is chosen so lines stay far enough apart to read.
  if (show.gridlines) {
    const spanE = t.toE ? t.toE(PLOT.x1) - t.toE(PLOT.x0) : 100;
    const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
    const step = nice.find((v) => v * t.scale >= 60) ?? 1000;
    const e0 = Math.ceil((t.toE ? t.toE(PLOT.x0) : 0) / step) * step;
    const n0 = Math.ceil((t.toN ? t.toN(PLOT.y1) : 0) / step) * step;
    for (let e = e0; t.x(e) <= PLOT.x1; e += step) {
      const x = t.x(e);
      for (let y = PLOT.y0; y <= PLOT.y1; y += 3) s.px(x, y, DARKGREY);
      s.text(String(Math.round(e)), x + 2, PLOT.y1 - 16, DARKGREY);
    }
    for (let n = n0; t.y(n) >= PLOT.y0; n += step) {
      const y = t.y(n);
      for (let x = PLOT.x0; x <= PLOT.x1; x += 3) s.px(x, y, DARKGREY);
      s.text(String(Math.round(n)), PLOT.x0 + 2, y - 16, DARKGREY);
    }
  }

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
      // Observed green in v3.0. Crest and foot are identical in the only
      // sample available, so whether they differ in colour is unconfirmed.
      for (const [pts, colour] of [[bench.crest, GREEN], [bench.foot, GREEN]]) {
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1];
          if (a.e === null || b.e === null) continue;
          s.line(t.x(a.e), t.y(a.n), t.x(b.e), t.y(b.n), colour);
        }
      }
    }
  }

  // --- surface ties ---
  // Tie colour comes from the link's detonator type, not a fixed colour: each
  // surface product draws in its own colour, which is what the detonator bar
  // along the top is previewing. Confirmed on TEST3.XEL, where type-4 ties
  // render magenta rather than the yellow seen on DHDETC.XEL.
  const byIndex = new Map(plan.holes.map((h) => [h.index + 1, h])); // links are 1-based
  if (show.ties && !show.collarsOnly) {
    for (const l of plan.links) {
      const a = byIndex.get(l.hole1);
      const b = byIndex.get(l.hole2);
      if (!a || !b || a.e === null || b.e === null) continue;
      const c = TIE_COLOURS[l.type % TIE_COLOURS.length];
      const ax = t.x(a.e), ay = t.y(a.n), bx = t.x(b.e), by = t.y(b.n);
      s.line(ax, ay, bx, by, c);
      // Ties carry a direction arrow: the tie-up is directed, and which way a
      // connector fires is the whole point of reading the plan.
      arrowHead(s, ax, ay, bx, by, c);
    }
  }

  // --- holes ---
  const r = Math.max(2, Math.min(3, Math.round(t.scale * 0.6)));
  // Dummy holes are drawn as a cross, not a circle — they occupy a position
  // but do not fire, and the original marks them distinctly for that reason.
  for (const h of dummyHoles(plan)) {
    if (h.e === null) continue;
    const x = t.x(h.e), y = t.y(h.n);
    s.line(x - r, y - r, x + r, y + r, WHITE);
    s.line(x - r, y + r, x + r, y - r, WHITE);
  }
  const vis = opts.visualization;
  for (const h of liveHoles(plan)) {
    if (h.e === null) continue;
    const x = t.x(h.e), y = t.y(h.n);
    if (vis && vis.hasFired(h.index + 1)) {
      burst(s, x, y, r);
    } else {
      s.fillCircle(x, y, r, BLACK);
      s.circle(x, y, r, WHITE);
    }
  }

  // --- hole tracks ---
  // The plan projection of the borehole, drawn as a dotted RECTANGLE - the
  // hole has width, and at the zoom where tracks are worth looking at that
  // width is visible.
  //
  // Geometry comes from `dip` and `bearing`, both radians: horizontal run is
  // depth * sin(dip). TEST4's holes dip 0.2618 rad - exactly 15 degrees - on a
  // bearing of 90, giving a 3.11 m run east for a 12 m hole, which is what
  // v3.0 draws. The `angle` field (102 degrees here) is NOT this angle;
  // deriving the run from it gives 2.49 m.
  //
  // A vertical hole has dip 0 and so no track at all, which is why TEST3 shows
  // none.
  if (show.holeTracks) {
    // Width is the hole diameter, which has not been located in the format
    // yet, so a nominal 0.2 m is used with a 3 px floor so the rectangle stays
    // legible when zoomed out.
    const NOMINAL_DIAMETER = 0.2;
    const halfW = Math.max(1.5, (NOMINAL_DIAMETER * t.scale) / 2);
    for (const h of liveHoles(plan)) {
      if (h.e === null || !h.depth) continue;
      const run = h.depth * Math.sin(h.dip || 0);
      const te = h.e + run * Math.sin(h.bearing);
      const tn = h.n + run * Math.cos(h.bearing);
      const x0 = t.x(h.e), y0 = t.y(h.n), x1 = t.x(te), y1 = t.y(tn);
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 2) {
        // A vertical hole has no run, so there is no rectangle to draw. v3.0
        // still marks it: a short line straight through the collar, showing
        // the hole is present and tracked but going nowhere in plan.
        const m = Math.max(3, Math.round(halfW * 2));
        s.line(x0 - m, y0, x0 + m, y0, LIGHTGREY);
        continue;
      }
      const px = (-(y1 - y0) / len) * halfW;
      const py = ((x1 - x0) / len) * halfW;
      const c = [
        { x: x0 + px, y: y0 + py }, { x: x1 + px, y: y1 + py },
        { x: x1 - px, y: y1 - py }, { x: x0 - px, y: y0 - py },
      ];
      // Dotted outline, closed - solid would read as a tie.
      dottedPath(s, [...c, c[0]], LIGHTGREY, 2);
    }
  }

  // --- per-hole labels ---
  //
  // v3.0 stacks these around the collar: in-hole delay and nominal firing time
  // above, depth and diameter below.
  //
  // Suppressed when the holes are closer together than the labels are wide.
  // This is a deliberate departure: the original draws them at any zoom, and on
  // a 200-hole plan viewed as an overview that is an unreadable mat of
  // overlapping digits. You would zoom in before turning them on, so the
  // outcome is the same - but a toggle that produces mush is worse than one
  // that waits until it can tell you something.
  const spacing = plan.defaults?.spacing || 3;
  const roomForLabels = t.scale * spacing >= 45;
  if (roomForLabels && (show.nomTimes || show.inholeDelay || show.depthDia)) {
    for (const h of liveHoles(plan)) {
      if (h.e === null) continue;
      const x = t.x(h.e), y = t.y(h.n);
      if (show.inholeDelay) {
        const d = opts.inholeDelayOf?.(h);
        if (d !== undefined && d !== null) s.text(String(Math.round(d)), x - 30, y - 16, LIGHTGREY);
      }
      if (show.nomTimes) {
        const ft = opts.fireTimeOf?.(h);
        if (ft !== undefined && ft !== null) s.text(String(Math.round(ft)), x + 5, y - 16, LIGHTCYAN);
      }
      if (show.depthDia) {
        s.text(h.depth.toFixed(1), x - 8, y + 6, LIGHTGREY);
      }
    }
  }

  // --- initiation point ---
  // The tie-up is directed, so the starting hole is the one that is some
  // link's source but never any link's target. Drawn as a filled magenta
  // marker with its number, as v3.0 does.
  if (show.ties) {
    const targets = new Set(plan.links.map((l) => l.hole2));
    const sources = [...new Set(plan.links.map((l) => l.hole1))].filter((h) => !targets.has(h));
    sources.forEach((idx, k) => {
      const h = byIndex.get(idx);
      if (!h || h.e === null) return;
      const x = t.x(h.e), y = t.y(h.n);
      leadInMarker(s, x, y + 4, String(k + 1));
    });
  }

  // --- text annotations ---
  if (show.texts) {
    for (const tx of plan.texts) {
      if (tx.e === null) continue;
      s.text(tx.text, t.x(tx.e) + 4, t.y(tx.n) - 8, WHITE);
    }
  }

  // --- highlighted hole (hover / selection) ---
  if (opts.highlight && opts.highlight.e !== null) {
    const x = t.x(opts.highlight.e), y = t.y(opts.highlight.n);
    s.circle(x, y, r + 3, YELLOW);
    s.circle(x, y, r + 4, YELLOW);
  }

  // --- rubber-band zoom rectangle ---
  if (opts.rubber) {
    const { x0, y0, x1, y1 } = opts.rubber;
    dashedRect(s, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), YELLOW);
  }

  // Elapsed-time counter, top right, as v3.0 shows during Visualize.
  if (opts.visualization) {
    const label = `${Math.round(opts.visualization.t)}ms`;
    s.text(label, PLOT.x1 - label.length * 8 - 6, PLOT.y0 + 6, WHITE);
  }

  drawScaleBar(s, t);
  s.resetClip();
}

/**
 * Arrowhead partway along a tie, pointing from (ax,ay) toward (bx,by).
 * Placed at ~60% rather than the midpoint so it stays clear of the collar
 * circles where several ties converge.
 */
function arrowHead(s, ax, ay, bx, by, c) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 10) return;
  const ux = dx / len, uy = dy / len;
  const size = 4;
  // v3.0 draws a run of chevrons along the tie rather than one arrowhead,
  // which reads as direction even where lines cross.
  for (const at of (len > 26 ? [0.42, 0.58] : [0.5])) {
    const px = Math.round(ax + dx * at), py = Math.round(ay + dy * at);
    for (const sgn of [1, -1]) {
      const nx = -uy * sgn, ny = ux * sgn;
      s.line(px, py, Math.round(px - ux * size + nx * size * 0.7),
             Math.round(py - uy * size + ny * size * 0.7), c);
    }
  }
}

/**
 * A detonated hole. v3.0 replaces the collar circle with a burst that stays
 * lit for the rest of the run, so the fired region reads as a growing front.
 * The burst flares briefly white then settles to yellow/red.
 */
const BURST_COLOUR = { r: RED, R: LIGHTRED, Y: YELLOW, W: WHITE };

/**
 * A detonated hole, blitted from the original's own sprite.
 *
 * Scaled down when the view is zoomed out far enough that a full-size burst
 * would swamp the pattern — the original runs at one fixed plan scale, so this
 * is the one place a zoomable rebuild has to make a decision the original never
 * faced. Nearest-neighbour, so it stays on the pixel grid either way.
 */
function burst(s, x, y, r) {
  const step = r >= 4 ? 1 : 2;   // drop every other pixel when collars are tiny
  const ox = x - Math.floor(BURST_W / (2 * step));
  const oy = y - Math.floor(BURST_H / (2 * step));
  for (let sy = 0; sy < BURST_H; sy += step) {
    const row = BURST[sy];
    for (let sx = 0; sx < BURST_W; sx += step) {
      const c = BURST_COLOUR[row[sx]];
      if (c !== undefined) s.px(ox + sx / step, oy + sy / step, c);
    }
  }
}

/**
 * Lead-in marker: a house shape — a square body under a pitched roof — filled
 * magenta with the lead-in number on it. Drawn below the collar it belongs to.
 */
function leadInMarker(s, x, yTop, label) {
  const w = 5;              // half-width of the body
  const roof = 4;           // roof height
  const body = 11;          // body height
  // Roof: widening rows up to the eaves.
  for (let i = 0; i < roof; i++) {
    const half = Math.round((i / (roof - 1)) * w);
    s.hline(x - half, x + half, yTop + i, MAGENTA);
  }
  s.fillRect(x - w, yTop + roof, x + w, yTop + roof + body, MAGENTA);
  s.text(label, x - 3, yTop + roof + 1, WHITE, MAGENTA);
}

/**
 * Time Envelope: a bar graph of holes per window across the blast, with the
 * summary figures the original prints beside it.
 *
 * Bars are drawn from the baseline up, one pixel column per bin where they
 * fit, widening only when the plan is short enough to allow it — the original
 * calls it a "vertical bar graph" and a 200-hole plan spanning 2800 ms has to
 * fit the same box a 25-hole plan does.
 */
export function drawEnvelope(s, times, opts = {}) {
  const window = opts.window ?? 8;
  const h = histogram(times, window);
  const sum = envelopeSummary(times, window);

  // v3.0 gives this calculation the whole screen on a BLUE field: no white
  // frame, no black plot area, and no detonator bar. Only the menu bar and the
  // status line survive. Measured from a capture of Time Envelope on TEST3.
  s.clear(BLUE);

  const left = PLOT.x0 + 60;
  const right = PLOT.x1 - 20;
  const base = PLOT.y1 - 60;
  const top = PLOT.y0 + 40;
  const gw = right - left;
  const gh = base - top;

  // Axes in white.
  s.hline(left, right, base, WHITE);
  s.vline(left, top, base, WHITE);

  // Y axis: the original labels it 0 .. 1. in 0.2 steps, i.e. a real numeric
  // axis rather than integer counts, and writes the label rotated up the side.
  const peak = Math.max(1, h.peak);
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = (peak * i) / ticks;
    const y = base - Math.round((gh * i) / ticks);
    s.hline(left - 4, left, y, WHITE);
    // Pascal prints reals with a trailing point when the fraction is zero.
    const lbl = Number.isInteger(v) ? `${v}.` : v.toFixed(1);
    s.text(lbl, left - 10 - lbl.length * 8, y - 7, WHITE);
  }
  s.textRot('Number Holes firing', PLOT.x0 + 6, base, WHITE);

  // X axis: round tick steps across the blast.
  const tMin = 0;
  const tMax = Math.max(1, times.last);
  const niceStep = [10, 20, 25, 50, 100, 200, 250, 500, 1000]
    .find((st) => tMax / st <= 8) ?? 1000;
  for (let t = tMin; t <= tMax + 1e-6; t += niceStep) {
    const x = left + Math.round((t / tMax) * gw);
    s.vline(x, base, base + 4, WHITE);
    const lbl = t === 0 ? '0' : `${t}.`;
    s.text(lbl, x - Math.floor((lbl.length * 8) / 2), base + 8, WHITE);
  }
  const xlab = 'Nominal in-hole firing time in milliseconds';
  s.text(xlab, left + Math.round((gw - xlab.length * 8) / 2), base + 34, WHITE);

  // Bars: thin yellow verticals from the baseline.
  for (let i = 0; i < h.bins.length; i++) {
    if (!h.bins[i]) continue;
    const t = h.t0 + i * h.binMs;
    const x = left + Math.round((t / tMax) * gw);
    const bh = Math.round((h.bins[i] / peak) * gh);
    s.vline(x, base - bh, base - 1, YELLOW);
  }

  // Summary block, upper right, in the original's wording and order.
  const C = right - 34 * 8;
  s.text(`First hole fires at ${times.first.toFixed(1).padStart(7)} ms`, C, PLOT.y0 - 4, WHITE);
  s.text(`Last  hole fires at ${times.last.toFixed(1).padStart(7)} ms`, C, PLOT.y0 + 12, WHITE);
  s.text(`Blast duration      ${times.duration.toFixed(1).padStart(7)} ms`, C, PLOT.y0 + 28, WHITE);

  // Explore: a cursor line and the slice readout under it.
  if (opts.cursorX !== undefined && opts.cursorX >= left && opts.cursorX <= right) {
    const t = ((opts.cursorX - left) / gw) * tMax;
    const count = holesInSlice(times, t, window);
    s.vline(opts.cursorX, top, base - 1, LIGHTCYAN);
    s.text(`${window} ms time slice at ${Math.round(t)} ms overlaps ${count} holes`,
           left, top - 20, LIGHTCYAN);
  }
}

/**
 * Overlap: the Delaunay adjacency mesh, each edge coloured by the probability
 * that the pair misbehaves, with the original's legend box.
 *
 * Colours are read off v3.0's own legend. Edges below the lowest band are not
 * drawn at all - the original's floor, and it is what makes the plot readable,
 * since most pairs in a sound tie-up are nowhere near reversing.
 */
export const BAND_COLOURS = [LIGHTRED, YELLOW, LIGHTBLUE, LIGHTGREEN];

export function drawOverlap(s, plan, result, opts = {}) {
  const show = { ...opts };
  const t = opts.transform ?? fitTransform(planBounds(plan));

  // Same chrome as the plan view - Overlap draws over the plan, not instead
  // of it.
  const overview = opts.isOverview !== false;
  s.clear(overview ? CYAN : BLUE);
  s.fillRect(FRAME.x0, FRAME.y0, FRAME.x1, FRAME.y1, WHITE);
  s.fillRect(PLOT.x0, PLOT.y0, PLOT.x1, PLOT.y1, BLACK);
  if (!plan || !t || !result) return;

  s.setClip(PLOT.x0, PLOT.y0, PLOT.x1, PLOT.y1);

  // Boundary and benches stay visible for context.
  if (plan.boundary.length > 1) {
    for (let i = 0; i < plan.boundary.length; i++) {
      const a = plan.boundary[i];
      const b = plan.boundary[(i + 1) % plan.boundary.length];
      if (a.e === null || b.e === null) continue;
      s.line(t.x(a.e), t.y(a.n), t.x(b.e), t.y(b.n), MAGENTA);
    }
  }
  for (const bench of plan.benches) {
    for (const pts of [bench.crest, bench.foot]) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        if (a.e === null || b.e === null) continue;
        s.line(t.x(a.e), t.y(a.n), t.x(b.e), t.y(b.n), GREEN);
      }
    }
  }

  // Adjacency edges, worst last so the dangerous ones sit on top.
  const metric = opts.metric ?? 'reversal';
  const drawn = result.edges
    .map((e) => ({ e, band: bandOf(e[metric]) }))
    .filter((x) => x.band >= 0)
    .sort((x, y) => y.band - x.band);
  for (const { e, band } of drawn) {
    const A = result.holes[e.a], B = result.holes[e.b];
    if (!A || !B) continue;
    s.line(t.x(A.e), t.y(A.n), t.x(B.e), t.y(B.n), BAND_COLOURS[band]);
  }

  // Collars on top.
  const r = Math.max(2, Math.min(3, Math.round(t.scale * 0.6)));
  for (const h of result.holes) {
    if (h.e === null) continue;
    const x = t.x(h.e), y = t.y(h.n);
    s.fillCircle(x, y, r, BLACK);
    s.circle(x, y, r, WHITE);
  }

  drawScaleBar(s, t);
  s.resetClip();

  // Legend, upper right inside the plot.
  const lw = 9 * 8;   // wide enough for '>10%' plus the colour swatch
  const lh = BANDS.length * 14 + 8;
  const lx = PLOT.x1 - lw - 8;
  const ly = PLOT.y0 + 8;
  s.fillRect(lx, ly, lx + lw, ly + lh, BLACK);
  s.rect(lx, ly, lx + lw, ly + lh, WHITE);
  BANDS.forEach((b, i) => {
    const y = ly + 5 + i * 14;
    s.hline(lx + 5, lx + 22, y + 7, BAND_COLOURS[i]);
    s.text(b.label, lx + 26, y, WHITE);
  });
}

/**
 * A filled block arrow centred on (cx, cy), pointing along the unit vector
 * (ux, uy), `len` pixels long. Drawn as one convex polygon: a shaft that
 * widens into a head.
 */
function blockArrow(s, cx, cy, ux, uy, len, colour) {
  const w = Math.max(2, Math.round(len * 0.16));   // half-width of the shaft
  const hw = Math.max(4, Math.round(len * 0.34));  // half-width of the head
  const hx = len * 0.25;                           // where the head starts
  const px = -uy, py = ux;                         // perpendicular
  const at = (along, across) => ({
    x: cx + ux * along + px * across,
    y: cy + uy * along + py * across,
  });
  s.fillPoly([
    at(-len / 2, -w), at(hx, -w), at(hx, -hw),
    at(len / 2, 0),
    at(hx, hw), at(hx, w), at(-len / 2, w),
  ], colour);
}

/**
 * Relief bands, ms per metre.
 *
 * Read off v3.0's legend strip: `Relief ms/m 10.< <15. <20. <25. <30. <35.`
 * The quantity is the magnitude of the timing gradient across each triangle -
 * how many milliseconds separate holes a metre apart. Low relief means the
 * next row gets little time to move before its neighbour fires.
 *
 * Colours are taken from the legend swatches. The topmost band (above 35) is
 * not in the legend and is left unfilled, as the original appears to.
 */
export const RELIEF_BANDS = [
  { max: 10, colour: LIGHTGREY, label: '10.<' },
  { max: 15, colour: MAGENTA, label: '<15.' },
  { max: 20, colour: LIGHTBLUE, label: '<20.' },
  { max: 25, colour: CYAN, label: '<25.' },
  { max: 30, colour: GREEN, label: '<30.' },
  { max: 35, colour: YELLOW, label: '<35.' },
];

/** Relief legend, drawn across the strip the detonator bar normally occupies. */
export function drawReliefLegend(s) {
  s.fillRect(0, 16, WIDTH - 1, 31, BLUE);
  s.text('Relief ms/m', 0, 16, WHITE, BLUE);
  let x = 12 * 8;
  for (const b of RELIEF_BANDS) {
    s.fillRect(x, 20, x + 10, 28, b.colour);
    s.text(b.label, x + 14, 16, WHITE, BLUE);
    x += 9 * 8;
  }
}

/**
 * Calculations > Relief.
 *
 * Each triangle is hatched in the colour of its relief band. Hatching rather
 * than flooding keeps the collars and bench lines visible through the fill,
 * which on 16 colours a solid fill would bury.
 */
export function drawRelief(s, plan, field, opts = {}) {
  const t = opts.transform ?? fitTransform(planBounds(plan));
  const overview = opts.isOverview !== false;
  s.clear(overview ? CYAN : BLUE);
  s.fillRect(FRAME.x0, FRAME.y0, FRAME.x1, FRAME.y1, WHITE);
  s.fillRect(PLOT.x0, PLOT.y0, PLOT.x1, PLOT.y1, BLACK);
  if (!plan || !t || !field) return;

  s.setClip(PLOT.x0, PLOT.y0, PLOT.x1, PLOT.y1);

  // Each gradient carries its own triangle: degenerate ones are skipped, so
  // the arrays do not line up index-for-index.
  for (const g of firstMovement(field)) {
    const band = RELIEF_BANDS.find((r) => g.gradient < r.max);
    if (!band) continue;                        // above the top band: unfilled
    const poly = g.tri.map((i) => ({
      x: t.x(field.pts[i].x), y: t.y(field.pts[i].y),
    }));
    s.hatchPoly(poly, band.colour);
  }

  for (const bench of plan.benches) {
    for (const pts of [bench.crest, bench.foot]) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const p = pts[i], q = pts[i + 1];
        if (p.e === null || q.e === null) continue;
        s.line(t.x(p.e), t.y(p.n), t.x(q.e), t.y(q.n), GREEN);
      }
    }
  }

  const r = Math.max(2, Math.min(3, Math.round(t.scale * 0.6)));
  for (const h of field.holes) {
    const x = t.x(h.e), y = t.y(h.n);
    s.fillCircle(x, y, r, BLACK);
    s.circle(x, y, r, WHITE);
  }

  drawScaleBar(s, t);
  s.resetClip();
}

/** Dotted polyline, as v3.0 draws contours. */
function dottedPath(s, pts, colour, every = 3) {
  let n = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const x0 = pts[i].x, y0 = pts[i].y, x1 = pts[i + 1].x, y1 = pts[i + 1].y;
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= steps; k++) {
      if (n++ % every === 0) {
        s.px(Math.round(x0 + ((x1 - x0) * k) / steps),
             Math.round(y0 + ((y1 - y0) * k) / steps), colour);
      }
    }
  }
}

/**
 * Angle of initiation > Contours, and > First Movement.
 *
 * Both draw the same field. Contours are dotted yellow with the level written
 * at each end of every polyline; first movement is one arrow per hole pointing
 * down-gradient.
 */
export function drawContours(s, plan, field, opts = {}) {
  const t = opts.transform ?? fitTransform(planBounds(plan));
  const overview = opts.isOverview !== false;
  s.clear(overview ? CYAN : BLUE);
  s.fillRect(FRAME.x0, FRAME.y0, FRAME.x1, FRAME.y1, WHITE);
  s.fillRect(PLOT.x0, PLOT.y0, PLOT.x1, PLOT.y1, BLACK);
  if (!plan || !t || !field) return { step: 0 };

  s.setClip(PLOT.x0, PLOT.y0, PLOT.x1, PLOT.y1);

  for (const bench of plan.benches) {
    for (const pts of [bench.crest, bench.foot]) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        if (a.e === null || b.e === null) continue;
        s.line(t.x(a.e), t.y(a.n), t.x(b.e), t.y(b.n), GREEN);
      }
    }
  }

  const r = Math.max(2, Math.min(3, Math.round(t.scale * 0.6)));
  for (const h of field.holes) {
    const x = t.x(h.e), y = t.y(h.n);
    s.fillCircle(x, y, r, BLACK);
    s.circle(x, y, r, WHITE);
  }

  let step = 0;
  if (opts.mode === 'First Movement') {
    // One block arrow per triangle, sitting in the gap between the three
    // holes that determine it — which is also the ground that moves.
    const arrows = firstMovement(field);
    const L = Math.max(5, Math.min(11, Math.round(t.scale * 1.1)));
    for (const a of arrows) {
      // Screen y is inverted relative to northing, so flip dy.
      blockArrow(s, t.x(a.x), t.y(a.y), a.dx, -a.dy, L, YELLOW);
    }
  } else {
    const c = contours(field, opts.step);
    step = c.step;
    for (const { level, lines } of c.levels) {
      for (const line of lines) {
        const px = line.map((p) => ({ x: t.x(p.x), y: t.y(p.y) }));
        dottedPath(s, px, YELLOW);
        // Label both ends, as v3.0 does.
        const lbl = String(Math.round(level));
        for (const end of [px[0], px[px.length - 1]]) {
          s.text(lbl, end.x - lbl.length * 4, end.y - 8, YELLOW);
        }
      }
    }
  }

  drawScaleBar(s, t);
  s.resetClip();
  return { step };
}

/** Marching-ant style rectangle for the zoom window. */
function dashedRect(s, x0, y0, x1, y1, c) {
  for (let x = x0; x <= x1; x++) {
    if ((x >> 1) % 2 === 0) { s.px(x, y0, c); s.px(x, y1, c); }
  }
  for (let y = y0; y <= y1; y++) {
    if ((y >> 1) % 2 === 0) { s.px(x0, y, c); s.px(x1, y, c); }
  }
}

/** Draw the whole screen. */
export function drawScreen(s, plan, filename, opts) {
  s.clear(opts?.isOverview !== false ? CYAN : BLUE);
  drawMenuBar(s, opts?.activeMenu ?? -1);
  drawDetonatorBar(s, plan);
  drawPlan(s, plan, opts);
  drawStatusBar(s, filename, plan?.title ?? '', opts?.status);
}
