/**
 * Edit mode.
 *
 * A second application, not a menu. The whole bar changes to
 * `Add Remove Change Show Window Data Exit EDIT`, the status line is replaced
 * by a live toggle strip, and the pointer becomes a tool.
 *
 * ## The interaction model, from watching v3.0
 *
 * Add Tie is the pattern the others follow:
 *
 *   1. Edit > Add > Tie
 *   2. Click a product in the detonator bar to ARM it — it highlights yellow
 *   3. Prompt: "Use Left/INS button on first hole or Right/DEL button to finish"
 *   4. The pointer becomes the START connector
 *   5. Click a hole; the pointer becomes the END connector
 *   6. Click a second hole; the tie is drawn in the armed product's colour
 *   7. The pointer returns to START, ready for the next tie
 *   8. Right/DEL finishes
 *
 * The mode is carried by the POINTER, not by the status line. Which connector
 * you are holding tells you whether your next click starts a tie or finishes
 * one, so you never look away from the plan. Worth preserving exactly.
 */

/** Verbatim from SHOTPLAN.OVR. */
export const TIE_PROMPT =
  'Use Left/INS button on first hole or Right/DEL button to finish';

/**
 * Distance between two holes, which a tie records as its own `dist` and which
 * Quantities later adds up as tube length.
 */
export function holeDistance(a, b) {
  return Math.hypot((a.e ?? 0) - (b.e ?? 0), (a.n ?? 0) - (b.n ?? 0));
}

/**
 * Add a surface tie between two holes.
 *
 * Mutates the plan the way the original does: appends to the link table and
 * bumps the count. Hole references are 1-BASED, matching the file format.
 *
 * Refuses a duplicate in either direction — a tie-up is a directed graph, but
 * two connectors between the same pair is a wiring error rather than a design.
 *
 * @returns {{ok: boolean, reason?: string}}
 */
export function addTie(plan, hole1Index1, hole2Index1, detonatorType) {
  if (hole1Index1 === hole2Index1) {
    return { ok: false, reason: 'Excuse me! You have chosen the same point twice' };
  }
  const byIndex = new Map(plan.holes.map((h) => [h.index + 1, h]));
  const a = byIndex.get(hole1Index1);
  const b = byIndex.get(hole2Index1);
  if (!a || !b) return { ok: false, reason: 'Argh!! - Invalid pointers' };

  const exists = plan.links.some(
    (l) => (l.hole1 === hole1Index1 && l.hole2 === hole2Index1)
        || (l.hole1 === hole2Index1 && l.hole2 === hole1Index1)
  );
  if (exists) return { ok: false, reason: 'These holes are already tied' };

  plan.links.push({
    index: plan.links.length,
    hole1: hole1Index1,
    hole2: hole2Index1,
    fLink: 0,
    bLink: 0,
    type: detonatorType,
    dist: holeDistance(a, b),
  });
  plan.tables.nLinks = plan.links.length;
  return { ok: true };
}

/** Remove a tie by its position in the table. */
export function removeTie(plan, index) {
  if (index < 0 || index >= plan.links.length) return false;
  plan.links.splice(index, 1);
  plan.links.forEach((l, i) => { l.index = i; });
  plan.tables.nLinks = plan.links.length;
  return true;
}

/**
 * The tie nearest a world position, within `tol` metres of the segment.
 * Used by Remove and Change.
 */
export function pickTie(plan, e, n, tol) {
  const byIndex = new Map(plan.holes.map((h) => [h.index + 1, h]));
  let best = -1;
  let bestD = tol;
  plan.links.forEach((l, i) => {
    const a = byIndex.get(l.hole1);
    const b = byIndex.get(l.hole2);
    if (!a || !b || a.e === null || b.e === null) return;
    const d = pointToSegment(e, n, a.e, a.n, b.e, b.n);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

function pointToSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
