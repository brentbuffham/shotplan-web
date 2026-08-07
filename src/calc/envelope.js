/**
 * Time Envelope — how many holes detonate together.
 *
 * The headline question a blast engineer asks of a tie-up: at any instant,
 * how much explosive is going off at once? Too many holes inside one window
 * and you get ground vibration and airblast; too few and you lose the
 * relief that makes the next row break properly.
 *
 * Strings recovered from SHOTPLAN.OVR describe both modes:
 *
 *   Display  a bar graph of holes per window, plus
 *              "Number Holes firing" / "First hole fires at " /
 *              "Last  hole fires at " / "Blast duration      "
 *              "This shows the maxiumum number of holes overlapping within
 *               a <n> ms window."          (typo is the original's)
 *
 *   Explore  "Use cursor and Left/INS button to select display range from
 *             vertical bar graph"
 *            "<n> ms time slice at <t> ms overlaps <h> holes"
 */

/** Window width in ms, as the original's "ms window" figure. */
export const DEFAULT_WINDOW = 8;

/**
 * Bin firing times into fixed windows.
 *
 * Bins are anchored at the first detonation rather than at zero, so the
 * histogram describes the blast rather than the clock — a plan whose lead-in
 * is 200 ms should not open with 25 empty bins.
 *
 * @returns {{bins: number[], binMs: number, t0: number, peak: number}}
 */
export function histogram(times, binMs = DEFAULT_WINDOW) {
  const values = [...times.fire.values()].sort((a, b) => a - b);
  if (!values.length) return { bins: [], binMs, t0: 0, peak: 0 };
  const t0 = values[0];
  const span = values[values.length - 1] - t0;
  const n = Math.max(1, Math.ceil((span + 1e-6) / binMs) + 1);
  const bins = new Array(n).fill(0);
  for (const v of values) {
    const i = Math.min(n - 1, Math.floor((v - t0) / binMs));
    bins[i]++;
  }
  return { bins, binMs, t0, peak: Math.max(...bins) };
}

/**
 * Maximum holes detonating within any `window` ms — a true sliding window,
 * not a bin count.
 *
 * This differs from the histogram's tallest bar, and the difference matters:
 * two holes 1 ms apart that straddle a bin boundary count as one each in the
 * histogram but two in the sliding window. The sliding figure is the honest
 * answer, and it is what the original reports.
 */
export function maxOverlapWindow(times, window = DEFAULT_WINDOW) {
  const t = [...times.fire.values()].sort((a, b) => a - b);
  let best = 0, lo = 0, at = 0;
  for (let hi = 0; hi < t.length; hi++) {
    while (t[hi] - t[lo] > window) lo++;
    if (hi - lo + 1 > best) { best = hi - lo + 1; at = t[lo]; }
  }
  return { count: best, at };
}

/** Holes detonating in the window starting at `t`. */
export function holesInSlice(times, t, window = DEFAULT_WINDOW) {
  let n = 0;
  for (const v of times.fire.values()) if (v >= t && v < t + window) n++;
  return n;
}

/** Everything the Display mode reports. */
export function envelopeSummary(times, window = DEFAULT_WINDOW) {
  const overlap = maxOverlapWindow(times, window);
  return {
    firing: times.fire.size,
    first: times.first,
    last: times.last,
    duration: times.duration,
    window,
    maxOverlap: overlap.count,
    maxOverlapAt: overlap.at,
  };
}
