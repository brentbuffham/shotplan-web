/**
 * Overlap — the probability that adjacent holes misbehave.
 *
 * Two questions, matching the original's submenu:
 *
 *   Out of sequence  P(the later hole fires first)
 *   Crowding 80%     P(the gap between them falls below 80% of its mean)
 *
 * "Adjacent" means joined by an edge of the Delaunay triangulation of the
 * collars, not joined by a connector. Physical neighbours are what govern
 * breakage.
 *
 * ## Why this needs simulation
 *
 * The tempting shortcut is analytic: if T1 ~ N(m1, s1^2) and T2 ~ N(m2, s2^2)
 * then T2 - T1 is normal and one call to the error function gives the answer.
 * That is WRONG here, and optimistically so.
 *
 * Two holes fed through the same lead-in and the same trunk share most of
 * their delay chain. Those shared devices scatter *together* — they are
 * common-mode and cancel in the difference. Treating the two times as
 * independent double-counts the shared variance and overstates the spread,
 * which understates reversal probability for closely-tied holes and overstates
 * it for holes on separate branches.
 *
 * Sampling whole blasts gets the correlation structure right for free: each
 * trial draws every device once and propagates, so shared devices genuinely
 * are shared. That is also what the original must do, given it exposes an
 * accuracy setting rather than reporting an exact figure.
 */
import { computeTimes } from './timing.js';
import { triangulate, pruneLongEdges } from './delaunay.js';
import { liveHoles } from '../format/xel.js';

/**
 * Probability bands and colours, read off v3.0's legend:
 *
 *     >10%  red      >5%  yellow      >1%  blue      >.1%  green
 *
 * Anything below 0.1% is not drawn — the original's own floor, and it also
 * keeps the plot readable, since most edges in a well-designed tie-up are
 * nowhere near reversing.
 */
export const BANDS = [
  { min: 0.10, label: '>10%' },
  { min: 0.05, label: '> 5%' },
  { min: 0.01, label: '> 1%' },
  { min: 0.001, label: '> .1%' },
];

/** Which band a probability falls in, or -1 for "do not draw". */
export function bandOf(p) {
  for (let i = 0; i < BANDS.length; i++) if (p >= BANDS[i].min) return i;
  return -1;
}

/** Adjacency edges between live holes, in plan coordinates. */
export function adjacency(plan) {
  const holes = liveHoles(plan).filter((h) => h.e !== null && h.n !== null);
  const pts = holes.map((h) => ({ x: h.e, y: h.n }));
  const { edges } = triangulate(pts);
  return { holes, edges: pruneLongEdges(pts, edges) };
}

/**
 * Run `trials` whole-blast simulations and score every adjacent pair.
 *
 * @returns {{holes: object[], edges: Array<{a,b,reversal,crowding,gap}>}}
 */
export function overlapProbabilities(plan, delayDb, opts = {}) {
  const trials = opts.trials ?? 400;
  const crowdFraction = opts.crowdFraction ?? 0.8;
  const rng = opts.rng ?? Math.random;

  const { holes, edges } = adjacency(plan);
  if (!edges.length) return { holes, edges: [] };

  const key = holes.map((h) => h.index + 1);

  // Nominal ordering decides which hole of each pair is "first"; the question
  // is how often reality disagrees with the design.
  const nominal = computeTimes(plan, delayDb, { mode: 'nominal' });
  const stats = edges.map(([a, b]) => {
    const ta = nominal.fire.get(key[a]) ?? 0;
    const tb = nominal.fire.get(key[b]) ?? 0;
    // Order so `first` is the one the design fires first.
    return ta <= tb
      ? { a, b, first: key[a], second: key[b], reversals: 0, crowded: 0, gapSum: 0 }
      : { a: b, b: a, first: key[b], second: key[a], reversals: 0, crowded: 0, gapSum: 0 };
  });

  for (let t = 0; t < trials; t++) {
    const s = computeTimes(plan, delayDb, { mode: 'sample', rng });
    for (const e of stats) {
      const t1 = s.fire.get(e.first);
      const t2 = s.fire.get(e.second);
      if (t1 === undefined || t2 === undefined) continue;
      e.gapSum += t2 - t1;
    }
  }
  const meanGap = new Map(stats.map((e) => [e, e.gapSum / trials]));

  // Second pass: crowding needs the mean gap, which the first pass produced.
  for (let t = 0; t < trials; t++) {
    const s = computeTimes(plan, delayDb, { mode: 'sample', rng });
    for (const e of stats) {
      const t1 = s.fire.get(e.first);
      const t2 = s.fire.get(e.second);
      if (t1 === undefined || t2 === undefined) continue;
      const gap = t2 - t1;
      if (gap < 0) e.reversals++;
      if (gap < crowdFraction * meanGap.get(e)) e.crowded++;
    }
  }

  return {
    holes,
    trials,
    edges: stats.map((e) => ({
      a: e.a,
      b: e.b,
      gap: meanGap.get(e),
      reversal: e.reversals / trials,
      crowding: e.crowded / trials,
    })),
  };
}
