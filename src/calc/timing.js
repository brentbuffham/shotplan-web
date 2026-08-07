/**
 * Firing-time engine.
 *
 * Everything under SHOTPlan's Calculations menu reduces to one number per
 * hole: when it fires. This computes that.
 *
 * ## The model
 *
 * Two networks, not one. The surface tie-up propagates a signal from hole to
 * hole across the bench; the in-hole delay then sits between a hole's collar
 * receiving that signal and its charge actually detonating.
 *
 *     surfaceArrival(hole)  = earliest signal arrival at the collar
 *     fireTime(hole)        = surfaceArrival(hole) + in-hole delay
 *
 * The in-hole delay does NOT hold up the surface network — the connector on
 * the surface fires from the collar regardless of what the downhole is doing.
 * Conflating the two is the classic way to get blast timing wrong, and the
 * program's own data dump keeps them in separate columns (`Delay`, `Surf.Nom`,
 * `Mean.T`) for exactly this reason.
 *
 * Arrival is the EARLIEST over all incoming paths — the first signal to reach
 * a connector fires it, and anything arriving later finds it already gone.
 * That makes this a shortest-path problem, so it is Dijkstra, not a walk.
 *
 * ## Nominal vs mean vs sampled
 *
 * Detonators carry a nominal delay, a measured mean, and a scatter. Which one
 * you propagate answers a different question:
 *
 *   'nominal'  what the design says      — deterministic, matches the label
 *   'mean'     what it does on average   — deterministic, and NOT the same
 *   'sample'   one possible real blast   — draws from N(mean, sd)
 *
 * Running 'sample' many times is what produces the overlap and out-of-sequence
 * probabilities. A deterministic tool cannot answer those at all.
 */
import { liveHoles } from '../format/xel.js';
import { normalFrom } from '../format/delays.js';

/** Collapse runs of whitespace so XEL and DELAYS.BIN names compare equal. */
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Resolve a plan's detonator slots against the delay database.
 *
 * `.XEL` files carry only product *names* and zeroed delay fields — the actual
 * timing lives in `DELAYS.BIN`. This is why the original refuses to calculate
 * against a stale database ("Error: This calculation requires an up-to-date
 * database.") rather than guessing.
 *
 * @returns {{surface: object[], inHole: object[], missing: string[]}}
 */
export function resolveDetonators(plan, delayDb) {
  const byName = new Map();
  if (delayDb) {
    for (const d of delayDb.detonators) if (d.name) byName.set(norm(d.name), d);
  }
  const missing = new Set();
  // Longest DB name that prefixes the slot description. The .XEL description
  // field is fixed width and can run into the following column, so
  // "CordOnly" arrives as "CordOnly 9" — an exact match alone drops it.
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const resolve = (slot) => {
    if (!slot || !slot.defined) return null;
    const want = norm(slot.description);
    const hit = byName.get(want) ?? byName.get(names.find((n) => want.startsWith(n)) ?? '');
    if (!hit) { missing.add(slot.description.trim()); return null; }
    return hit;
  };
  return {
    surface: plan.detonators.filter((d) => d.kind === 'surface').map(resolve),
    leadIn: plan.detonators.filter((d) => d.kind === 'lead-in').map(resolve),
    inHole: plan.detonators.filter((d) => d.kind === 'in-hole').map(resolve),
    missing: [...missing],
  };
}

/** Pick the delay value for a device under the chosen model. */
function delayOf(det, mode, rng) {
  if (!det) return 0;
  switch (mode) {
    case 'nominal': return det.nominal;
    case 'mean': return det.mean || det.nominal;
    case 'sample': {
      const mean = det.mean || det.nominal;
      if (!det.sd) return mean;
      return mean + det.sd * normalFrom(rng);
    }
    default: return det.nominal;
  }
}

/**
 * Holes that start the blast: a link's source but never any link's target.
 * Matches where v3.0 draws its magenta initiation marker.
 */
export function initiationHoles(plan) {
  const targets = new Set(plan.links.map((l) => l.hole2));
  // Hole indices are 1-based; 0 is the list terminator, not a hole.
  const sources = [...new Set(plan.links.map((l) => l.hole1))].filter((h) => h > 0);
  return sources.filter((h) => !targets.has(h));
}

/**
 * Compute firing times for every live hole.
 *
 * @param {object} plan       parsed .XEL
 * @param {object} delayDb    parsed DELAYS.BIN, or null
 * @param {object} [opts]     {mode, rng}
 * @returns {{
 *   arrival: Map<number, number>,   // 1-based hole index -> surface arrival ms
 *   fire: Map<number, number>,      // 1-based hole index -> detonation ms
 *   order: object[],                // live holes sorted by fire time
 *   unreached: object[],            // live holes the tie-up never reaches
 *   first: number, last: number, duration: number,
 *   missing: string[],
 * }}
 */
export function computeTimes(plan, delayDb, opts = {}) {
  const mode = opts.mode ?? 'nominal';
  const rng = opts.rng ?? Math.random;
  const det = resolveDetonators(plan, delayDb);

  const byIndex = new Map(plan.holes.map((h) => [h.index + 1, h]));

  // Adjacency: hole -> [{to, delay}]
  const out = new Map();
  for (const l of plan.links) {
    if (!byIndex.has(l.hole1) || !byIndex.has(l.hole2)) continue;
    // A link's `type` is a 1-BASED index into the surface detonator table,
    // exactly like a hole's `delay` is into the in-hole table. Reading it as
    // 0-based inflated TEST3.XEL's blast duration from 308 ms to 474 ms - each
    // tie picked up the next longer product in the series. v3.0 reports first
    // 25.0 / last 333.0 / duration 308.0 for that plan; this reproduces
    // 25.0 / 332.0 / 307.0.
    const device = det.surface[l.type - 1] ?? null;
    const d = delayOf(device, mode, rng);
    if (!out.has(l.hole1)) out.set(l.hole1, []);
    out.get(l.hole1).push({ to: l.hole2, delay: d });
  }

  // Dijkstra over surface arrival. Blast tie-ups are small (hundreds of
  // holes), so a linear scan for the frontier minimum is not worth improving.
  const arrival = new Map();
  const starts = initiationHoles(plan);
  for (const s of starts) arrival.set(s, 0);
  const settled = new Set();
  for (;;) {
    let best = null;
    let bestT = Infinity;
    for (const [h, t] of arrival) {
      if (!settled.has(h) && t < bestT) { bestT = t; best = h; }
    }
    if (best === null) break;
    settled.add(best);
    for (const e of out.get(best) ?? []) {
      const t = bestT + e.delay;
      if (!arrival.has(e.to) || t < arrival.get(e.to)) arrival.set(e.to, t);
    }
  }

  // Detonation = surface arrival + the hole's in-hole delay.
  const fire = new Map();
  const unreached = [];
  for (const h of liveHoles(plan)) {
    const key = h.index + 1;
    if (!arrival.has(key)) { unreached.push(h); continue; }
    // `delay` is a 1-based in-hole delay number into the in-hole table.
    const device = det.inHole[h.delay - 1] ?? null;
    fire.set(key, arrival.get(key) + delayOf(device, mode, rng));
  }

  const order = liveHoles(plan)
    .filter((h) => fire.has(h.index + 1))
    .sort((a, b) => fire.get(a.index + 1) - fire.get(b.index + 1));

  const times = [...fire.values()];
  const first = times.length ? Math.min(...times) : 0;
  const last = times.length ? Math.max(...times) : 0;

  return {
    arrival, fire, order, unreached,
    first, last, duration: last - first,
    missing: det.missing,
    mode,
  };
}

/**
 * Maximum number of holes detonating within any `window` ms.
 * This is the Time Envelope calculation's headline number.
 */
export function maxOverlap(times, window = 8) {
  const t = [...times].sort((a, b) => a - b);
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < t.length; hi++) {
    while (t[hi] - t[lo] > window) lo++;
    best = Math.max(best, hi - lo + 1);
  }
  return best;
}
