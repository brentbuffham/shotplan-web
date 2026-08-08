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

/**
 * Prompts, all verbatim from SHOTPLAN.OVR.
 *
 * Note that Add Tie has TWO: the wording changes once the first hole is
 * picked, so the status line and the cursor sprite both track the step. And
 * the Change prompt says "select surf. tie type AND tie to change", which is
 * the whole interaction - arm a product, then click the tie. You never have to
 * remove a tie to re-assign its connector.
 */
export const TIE_PROMPT_FIRST =
  'Use Left/INS button on first hole or Right/DEL button to finish';
export const TIE_PROMPT_SECOND =
  'Use Left/INS button on CONNECTING hole.';
export const TIE_PROMPT_DELETE =
  'Use Left/Ins key to select surface tie to delete then Right/Del to finish.';
export const TIE_PROMPT_CHANGE =
  'Use Left/Ins to select surf. tie type and tie to change or Right/Del to finish.';

/** Add prompts, verbatim from SHOTPLAN.OVR. */
export const ADD_HOLE_PROMPT =
  'Add holes using Left/Ins button then press Right/Del button to exit.';
export const ADD_DUMMY_PROMPT =
  'Add dummy holes using left/INS button then press right/DEL button to exit';
export const ADD_LEADIN_PROMPT =
  'Use Left/INS button to select hole to be initiated or Right/DEL to abort.';
export const ADD_TEXT_PROMPT =
  'Select top left corner of text string using Left/INS or Right/DEL or abort.';
export const ADD_BOUNDARY_PROMPT =
  'Mark boundary using Left/Ins buttons and cross lines to finish.';
export const ADD_BENCH_PROMPT =
  'Mark along crest of the bench using Left/Ins button then Right/Del to finish.';
export const ADD_PATTERN_PROMPT =
  'Indicate direction of the first row then Left/Ins or Right/Del to abort.';

/** Refusals, also verbatim. Note the original's own missing full stop. */
export const OUTSIDE_PLAN =
  'The selected position outside plan and cannot be used.';

/**
 * Add a hole, reusing a deleted record when one is free.
 *
 * The original keeps a free list rather than growing the table forever: a
 * deleted record is marked `kind < 0` and linked into a chain whose head is
 * `tables.holeFreePtr` and whose links are the records' own `fLink`. Adding a
 * hole pops that chain; only when it is empty does the record count grow.
 *
 * Getting this wrong is invisible in the app and corrupting in the file, so it
 * is worth doing properly: the chain was verified to walk every deleted record
 * exactly once in all four samples that have one.
 *
 * @param {object} plan
 * @param {number} e, n, rl   position
 * @param {object} [proto]    fields copied from a template hole (delay, depth,
 *                            diameter, angle) — v3.0 carries the last-used
 *                            values forward rather than prompting each time
 * @returns {{ok: boolean, index?: number, reused?: boolean, reason?: string}}
 */
export function addHole(plan, e, n, rl, proto = {}) {
  const t = plan.tables;
  const free = t.holeFreePtr | 0;
  const fields = {
    e, n, rl: rl ?? null,
    kind: proto.kind > 0 ? proto.kind : 1,
    flag: proto.flag ?? 0,
    fLink: 0,
    bLink: 0,
    angle: proto.angle ?? 0,
    depth: proto.depth ?? 0,
    dip: proto.dip ?? 0,
    bearing: proto.bearing ?? 0,
    delay: proto.delay ?? 1,
    unknown12: proto.unknown12 ?? 0,
    live: true, dummy: false, deleted: false,
    freeLink: null, deletedGroup: null,
  };

  if (free > 0) {
    const rec = plan.holes[free - 1];          // hole records are 1-based
    if (rec && rec.deleted) {
      t.holeFreePtr = rec.freeLink | 0;        // pop: head becomes the next link
      Object.assign(rec, fields, { index: rec.index });
      t.nBlastHoles = (t.nBlastHoles | 0) + 1;
      return { ok: true, index: rec.index + 1, reused: true };
    }
  }

  const rec = { index: plan.holes.length, ...fields };
  plan.holes.push(rec);
  t.nHoleRecords = plan.holes.length;
  t.nBlastHoles = (t.nBlastHoles | 0) + 1;
  return { ok: true, index: rec.index + 1, reused: false };
}

/**
 * Add a dummy hole — a real record at a real position that never fires.
 *
 * `kind === 0` is the whole difference. Dummies still take part in the
 * Delaunay adjacency and so affect contours and relief, which is exactly why
 * the original offers them: they let you shape the field near a free face
 * without adding explosive.
 */
export function addDummyHole(plan, e, n, rl) {
  const r = addHole(plan, e, n, rl);
  if (!r.ok) return r;
  const rec = plan.holes[r.index - 1];
  rec.kind = 0;
  rec.live = false;
  rec.dummy = true;
  // Dummies are not blast holes, so undo the count addHole made.
  plan.tables.nBlastHoles = (plan.tables.nBlastHoles | 0) - 1;
  return r;
}

/**
 * Delete a hole, pushing its record onto the free list.
 *
 * The inverse of addHole, and it must be, or the two disagree about the chain.
 * The new record becomes the head and links to the previous head.
 */
export function removeHole(plan, index1) {
  const rec = plan.holes[index1 - 1];
  if (!rec || rec.deleted) return false;
  const t = plan.tables;
  const wasLive = rec.live;
  rec.kind = -index1;
  rec.fLink = t.holeFreePtr | 0;
  rec.freeLink = t.holeFreePtr | 0;
  rec.deletedGroup = index1;
  rec.live = false;
  rec.dummy = false;
  rec.deleted = true;
  t.holeFreePtr = index1;
  if (wasLive) t.nBlastHoles = Math.max(0, (t.nBlastHoles | 0) - 1);

  // Ties referencing a removed hole would dangle, and v3.0 does not leave
  // them: removing a hole removes the ties on it.
  plan.links = plan.links.filter((l) => l.hole1 !== index1 && l.hole2 !== index1);
  plan.links.forEach((l, i) => { l.index = i; });
  t.nLinks = plan.links.length;
  return true;
}

/** Add a text string at a position. `texts` is modelled by the parser. */
export function addText(plan, e, n, text, height = 1) {
  plan.texts.push({ e, n, text, height });
  return { ok: true, index: plan.texts.length - 1 };
}

/** Append a vertex to the plan boundary. */
export function addBoundaryPoint(plan, e, n, rl = 0) {
  plan.boundary.push({ e, n, rl });
  return { ok: true, index: plan.boundary.length - 1 };
}

/** Re-assign an existing tie's surface product. */
export function changeTieType(plan, index, detonatorType) {
  if (index < 0 || index >= plan.links.length) return false;
  plan.links[index].type = detonatorType;
  return true;
}

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
 * A tie over an existing pair OVERWRITES it — checked against v3.0. It does
 * not refuse and it does not create a second connector. That is the better
 * design as well as the faithful one: re-arm a product, draw over a tie, and
 * it changes, without hunting for the exact line to pick. Direction is taken
 * from the new click order, so drawing back the other way reverses the tie.
 *
 * @returns {{ok: boolean, replaced?: boolean, reason?: string}}
 */
export function addTie(plan, hole1Index1, hole2Index1, detonatorType) {
  if (hole1Index1 === hole2Index1) {
    return { ok: false, reason: 'Excuse me! You have chosen the same point twice' };
  }
  const byIndex = new Map(plan.holes.map((h) => [h.index + 1, h]));
  const a = byIndex.get(hole1Index1);
  const b = byIndex.get(hole2Index1);
  if (!a || !b) return { ok: false, reason: 'Argh!! - Invalid pointers' };

  const existing = plan.links.find(
    (l) => (l.hole1 === hole1Index1 && l.hole2 === hole2Index1)
        || (l.hole1 === hole2Index1 && l.hole2 === hole1Index1)
  );
  if (existing) {
    existing.hole1 = hole1Index1;
    existing.hole2 = hole2Index1;
    existing.type = detonatorType;
    existing.dist = holeDistance(a, b);
    return { ok: true, replaced: true };
  }

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
