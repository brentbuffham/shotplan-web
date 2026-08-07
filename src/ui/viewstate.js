/**
 * The plan viewport: which patch of world coordinates the plot area shows.
 *
 * SHOTPlan's navigation vocabulary is Overview / Zoom / Expand / Contract
 * (Edit > Window, and Show > Overview|Zoom), so those are the operations
 * modelled here rather than a generic pan-and-scroll.
 *
 * Aspect is always preserved. The plot area is not square, so the viewport is
 * grown — never cropped — to match it. Cropping would silently hide holes,
 * which on a blast plan is the one failure mode that actually matters.
 */
import { PLOT } from '../render/view.js';

const MIN_SPAN = 0.5; // metres; stops zoom collapsing to a point

export class ViewState {
  constructor() {
    this.bounds = null; // {minE, maxE, minN, maxN}
    // The plot frame is drawn differently in each state: solid white on a cyan
    // desktop for Overview, dashed on blue for Zoom. So the view has to know
    // which it is in, not just where it is looking.
    this.isOverview = true;
  }

  /**
   * Fit the whole plan, with a margin. This is "Overview".
   *
   * If the plan carries text annotations, a second pass widens the view so
   * they fit. Text is drawn at a fixed pixel size, so its world extent is only
   * known once a scale exists — hence fit, measure, widen.
   */
  overview(planBounds, plan = null, margin = 0.06) {
    if (!planBounds) { this.bounds = null; return; }
    const de = Math.max(MIN_SPAN, planBounds.maxE - planBounds.minE);
    const dn = Math.max(MIN_SPAN, planBounds.maxN - planBounds.minN);
    const mx = de * margin;
    const my = dn * margin;
    this.set({
      minE: planBounds.minE - mx, maxE: planBounds.maxE + mx,
      minN: planBounds.minN - my, maxN: planBounds.maxN + my,
    });
    if (plan?.texts?.length) {
      const t = this.transform();
      let maxE = this.bounds.maxE;
      for (const tx of plan.texts) {
        if (tx.e === null) continue;
        const need = tx.e + (10 + tx.text.length * 8) / t.scale;
        if (need > maxE) maxE = need;
      }
      if (maxE > this.bounds.maxE) this.set({ ...this.bounds, maxE });
    }
    this.isOverview = true;
  }

  /** Set the viewport, correcting aspect by growing the short axis. */
  set(b) {
    const pw = PLOT.x1 - PLOT.x0;
    const ph = PLOT.y1 - PLOT.y0;
    let de = Math.max(MIN_SPAN, b.maxE - b.minE);
    let dn = Math.max(MIN_SPAN, b.maxN - b.minN);
    const cx = (b.minE + b.maxE) / 2;
    const cy = (b.minN + b.maxN) / 2;
    // Grow whichever axis is proportionally too small.
    if (de / pw > dn / ph) dn = (de / pw) * ph;
    else de = (dn / ph) * pw;
    this.bounds = {
      minE: cx - de / 2, maxE: cx + de / 2,
      minN: cy - dn / 2, maxN: cy + dn / 2,
    };
  }

  /** Zoom to an explicit world rectangle. Leaves Overview. */
  zoomTo(b) {
    this.set(b);
    this.isOverview = false;
  }

  /** Zoom about the viewport centre. factor < 1 zooms in. */
  scale(factor) {
    this.isOverview = false;
    if (!this.bounds) return;
    const b = this.bounds;
    const cx = (b.minE + b.maxE) / 2;
    const cy = (b.minN + b.maxN) / 2;
    const de = (b.maxE - b.minE) * factor;
    const dn = (b.maxN - b.minN) * factor;
    this.set({ minE: cx - de / 2, maxE: cx + de / 2, minN: cy - dn / 2, maxN: cy + dn / 2 });
  }

  expand() { this.scale(0.5); }   // Edit > Window > Expand — zoom in
  contract() { this.scale(2.0); } // Edit > Window > Contract — zoom out

  /** Recentre without changing scale. */
  panTo(e, n) {
    if (!this.bounds) return;
    this.isOverview = false;
    const b = this.bounds;
    const de = b.maxE - b.minE;
    const dn = b.maxN - b.minN;
    this.bounds = {
      minE: e - de / 2, maxE: e + de / 2,
      minN: n - dn / 2, maxN: n + dn / 2,
    };
  }

  /** Shift by a world delta. */
  panBy(de, dn) {
    if (!this.bounds) return;
    this.isOverview = false;
    const b = this.bounds;
    this.bounds = {
      minE: b.minE + de, maxE: b.maxE + de,
      minN: b.minN + dn, maxN: b.maxN + dn,
    };
  }

  /** World -> screen transform for the current viewport. */
  transform() {
    if (!this.bounds) return null;
    const b = this.bounds;
    const sx = (PLOT.x1 - PLOT.x0) / (b.maxE - b.minE);
    const sy = (PLOT.y1 - PLOT.y0) / (b.maxN - b.minN);
    const scale = Math.min(sx, sy);
    return {
      scale,
      x: (e) => Math.round(PLOT.x0 + (e - b.minE) * scale),
      y: (n) => Math.round(PLOT.y0 + (b.maxN - n) * scale),
      // Inverse, for turning cursor position back into survey coordinates.
      toE: (px) => b.minE + (px - PLOT.x0) / scale,
      toN: (py) => b.maxN - (py - PLOT.y0) / scale,
    };
  }
}

/** Nearest hole to a screen position, within `radius` pixels. */
export function pickHole(plan, t, px, py, radius = 8) {
  if (!plan || !t) return null;
  let best = null;
  let bestD2 = radius * radius;
  for (const h of plan.holes) {
    if (h.deleted || h.e === null) continue;
    const dx = t.x(h.e) - px;
    const dy = t.y(h.n) - py;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) { bestD2 = d2; best = h; }
  }
  return best;
}
