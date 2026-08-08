/**
 * Misfires.
 *
 * The calculation `RELDATA.BIN` exists for, and the one that answers a question
 * the rest of the package cannot: *if a surface connector fails, how much of
 * the blast is left standing?*
 *
 * Ported from the routine at `0x0137F0` in SHOTPLAN.OVR rather than
 * reconstructed. Offsets and the full trace are in the archive under
 * `docs/misfires-calculation.md`.
 *
 * ## The model
 *
 * A `RELDATA.BIN` figure is a **failure rate per 1000 devices** — the screen
 * says so (`Failure rate (/1000)`) and the arithmetic divides by a real48
 * constant that decodes to exactly 1000. So for a device with rate r,
 * p = r/1000, and
 *
 *     P(whole blast fires) = product over surface devices of (1 - p)
 *
 * ## Why enumeration and not sampling
 *
 * Overlap runs Monte Carlo because delays are continuous and correlated.
 * Misfires does not: a device either fires or it does not, and the original
 * enumerates failure combinations **exactly**. For a combination S it uses the
 * standard rearrangement
 *
 *     P(S) = P_all * product over i in S of p_i / (1 - p_i)
 *
 * which is what the multiply/divide sequence at 0x013D17-0x013D49 computes.
 *
 * Enumeration stops at **pairs**. That is not a simplification on my part: the
 * flood-fill helper takes exactly two tie arguments, and the call sites pass
 * (i, 0) for a single and (i, j) for a pair. Triples are never formed.
 *
 * Pairs are only explored where the single failure caused **no** misfire. If
 * failing tie i alone already orphans holes, combinations containing i are
 * skipped — that outcome is already accounted for by the single. This pruning
 * is in the original and it matters: without it the same orphaned holes get
 * counted repeatedly.
 */

/** Bins in the "extent of blast that fails to fire" histogram. */
export const MISFIRE_BINS = 40;

/** Firing times at or above this are the original's "did not fire" sentinel. */
export const NOT_FIRING = 1e6;

/**
 * Holes left unreached when a set of surface ties is disabled.
 *
 * The original clears a per-hole reached flag, seeds a stack from the lead-in
 * list and propagates along the ties, then reports how many holes were never
 * reached. This is that, using the same initiation holes the timing model uses.
 *
 * @param {object} graph   from buildGraph()
 * @param {number[]} cut   link indices to treat as failed
 * @returns {number} count of live holes that no longer fire
 */
export function orphanedHoles(graph, cut) {
  const dead = new Set(cut);
  const seen = new Set(graph.starts);
  const stack = [...graph.starts];
  while (stack.length) {
    const h = stack.pop();
    for (const e of graph.out.get(h) ?? []) {
      if (dead.has(e.link) || seen.has(e.to)) continue;
      seen.add(e.to);
      stack.push(e.to);
    }
  }
  let orphaned = 0;
  for (const h of graph.liveHoles) if (!seen.has(h)) orphaned++;
  return orphaned;
}

/**
 * Adjacency for the flood fill, keyed the way the original's tie table is.
 *
 * Only holes that actually fire are counted as at risk — the original's second
 * guard rejects the calculation outright when nothing fires, and holes already
 * sitting at the 1e6 sentinel cannot be "lost".
 */
export function buildGraph(plan, times) {
  const out = new Map();
  plan.links.forEach((l, i) => {
    if (l.hole1 <= 0 || l.hole2 <= 0) return;
    if (!out.has(l.hole1)) out.set(l.hole1, []);
    out.get(l.hole1).push({ to: l.hole2, link: i });
  });
  const targets = new Set(plan.links.map((l) => l.hole2));
  const starts = [...new Set(plan.links.map((l) => l.hole1))]
    .filter((h) => h > 0 && !targets.has(h));
  const liveHoles = [];
  for (const [h, t] of times.fire) if (t < NOT_FIRING) liveHoles.push(h);
  return { out, starts, liveHoles };
}

/**
 * @param {object} plan            parsed .XEL
 * @param {object} times           from computeTimes()
 * @param {(type:number)=>number} rateFor
 *        failure rate per 1000 for a surface detonator type, as stored in
 *        RELDATA.BIN. Supplied by the caller because resolving it needs
 *        PRODUCTS.BIN, which is a third party's data and stays out of this repo.
 * @returns {object} results, or {ok:false, reason} matching the original's refusals
 */
export function computeMisfires(plan, times, rateFor) {
  const graph = buildGraph(plan, times);

  // The two guards, in the original's order and wording.
  const armed = plan.links
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.type > 0);
  if (!armed.length) {
    return { ok: false, reason: 'Misfire calculation not posible - No surface detonators defined' };
  }
  if (!graph.liveHoles.length) {
    return { ok: false, reason: 'Misfire calculation not posible - No detonators firing' };
  }

  // p per tie. A rate of 0 means the device never fails, so it can never be
  // part of a failure combination and p/(1-p) is 0 — no special case needed.
  const p = new Map();
  for (const { l, i } of armed) p.set(i, (rateFor(l.type) || 0) / 1000);

  // P_all = product of (1 - p). A rate of 1000/1000 drives this to zero, which
  // is what the original does too; it is a property of the shipped placeholder
  // data, not of the formula.
  let pAll = 1;
  for (const { i } of armed) pAll *= 1 - p.get(i);

  const odds = (i) => {
    const pi = p.get(i);
    return pi >= 1 ? Infinity : pi / (1 - pi);
  };

  const outcomes = [];
  const total = graph.liveHoles.length;

  for (let a = 0; a < armed.length; a++) {
    const ia = armed[a].i;
    const single = orphanedHoles(graph, [ia]);
    if (single > 0) {
      outcomes.push({ cut: [ia], orphaned: single, prob: pAll * odds(ia) });
      continue;                       // pruned: pairs containing ia are covered
    }
    for (let b = a + 1; b < armed.length; b++) {
      const ib = armed[b].i;
      const pair = orphanedHoles(graph, [ia, ib]);
      if (pair > 0) {
        outcomes.push({ cut: [ia, ib], orphaned: pair, prob: pAll * odds(ia) * odds(ib) });
      }
    }
  }

  // Histogram of extent, 0-100% of the blast, 40 bins.
  const bins = new Array(MISFIRE_BINS).fill(0);
  let weighted = 0;
  for (const o of outcomes) {
    const frac = o.orphaned / total;
    weighted += o.prob * frac;
    const bin = Math.min(MISFIRE_BINS - 1, Math.max(0, Math.ceil(frac * MISFIRE_BINS) - 1));
    bins[bin] += o.prob;
  }

  // "One device misfire rate" is the mean per-device rate, reported per 1000
  // like everything else on that panel.
  const meanRate = armed.reduce((s, { i }) => s + p.get(i), 0) / armed.length * 1000;

  return {
    ok: true,
    holesFiring: total,
    surfaceDevices: armed.length,
    oneDeviceMisfireRate: meanRate,
    blastMisfireRate: 1 - pAll,
    averageMisfirePct: weighted * 100,
    bins,
    outcomes,
  };
}
