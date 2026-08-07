/**
 * Quantities — what has to be ordered for the shot.
 *
 * The only calculation that needs no timing at all. It counts holes and adds
 * up product lengths, which is why it stayed available in v3.0 even when the
 * product database would not load.
 *
 * Report headings are the original's, from SHOTPLAN.OVR:
 *
 *   =========== SHOTPlan QUANTITIES SUMMARY ============
 *   Number of holes defined  :
 *   Number of blast-holes    :
 *   Number of dummy holes    :
 *   Number of surface ties   :
 *     Product               Length usage                          Total
 *        5 metres required
 *
 * "Length usage" is tube or cord, so the two product families measure
 * differently: a surface connector spans the distance between two collars, and
 * a downline runs the depth of its hole. Both come out in metres and both get
 * rounded up, because you buy tube on a reel and cannot order 43.2 m of it.
 */
import { liveHoles, dummyHoles } from '../format/xel.js';

/** The original rounds up to whole reels. */
export const REEL_INCREMENT = 5;

export function roundUpToReel(metres, inc = REEL_INCREMENT) {
  return Math.ceil(metres / inc) * inc;
}

/**
 * @returns {{counts, products: Array<{name, kind, count, length, required}>}}
 */
export function quantities(plan) {
  const live = liveHoles(plan);
  const dummy = dummyHoles(plan);

  const surface = plan.detonators.filter((d) => d.kind === 'surface');
  const inHole = plan.detonators.filter((d) => d.kind === 'in-hole');
  const rows = new Map();

  const add = (name, kind, count, length) => {
    const key = `${kind}:${name}`;
    const r = rows.get(key) ?? { name, kind, count: 0, length: 0 };
    r.count += count;
    r.length += length;
    rows.set(key, r);
  };

  // Surface connectors: one per tie, spanning the distance between collars.
  for (const l of plan.links) {
    const det = surface[l.type - 1];
    if (!det || !det.defined) continue;
    add(det.description, 'surface', 1, l.dist || 0);
  }

  // Downlines: one per live hole, running the depth of that hole.
  for (const h of live) {
    const det = inHole[h.delay - 1];
    if (!det || !det.defined) continue;
    add(det.description, 'in-hole', 1, h.depth || 0);
  }

  const products = [...rows.values()]
    .map((r) => ({ ...r, required: roundUpToReel(r.length) }))
    .sort((a, b) => (a.kind === b.kind ? b.length - a.length : a.kind < b.kind ? 1 : -1));

  return {
    counts: {
      defined: plan.holes.filter((h) => !h.deleted).length,
      blast: live.length,
      dummy: dummy.length,
      ties: plan.links.length,
    },
    products,
    totalLength: products.reduce((a, r) => a + r.length, 0),
    totalRequired: products.reduce((a, r) => a + r.required, 0),
  };
}
