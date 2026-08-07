/**
 * A synthetic delay database, for builds that ship without a real one.
 *
 * SHOTPlan cannot calculate anything without a product database — the original
 * says so itself ("Error: This calculation requires an up-to-date database."),
 * and a public build has no business shipping ICI's. So this invents one.
 *
 * The product names are made up and match `demo-plan.js`. The *structure* is
 * real: every device carries a nominal delay, a measured mean that differs
 * from it, and a scatter. That is the whole point — a database of exact
 * nominal values would make every probability come out zero and the Overlap
 * calculation would look broken rather than reassuring.
 *
 * Scatter is modelled on the real relationship, which tightens with delay:
 * roughly 4% of nominal at 9 ms falling to under 1% at 600 ms. Means are
 * offset a little either side of nominal, as manufactured populations are.
 */

/** Deterministic jitter, so a given build always produces the same database. */
function wobble(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;      // -1 .. 1
}

function device(name, index, nominal, seed) {
  // Relative scatter falls as the delay lengthens.
  const relSd = 0.045 * Math.pow(nominal / 9, -0.42);
  return {
    name,
    index,
    nominal,
    nominal2: 0,
    mean: Number((nominal * (1 + wobble(seed) * 0.02)).toFixed(2)),
    sd: Number(Math.max(0.3, nominal * relSd).toFixed(2)),
  };
}

const SURFACE = [9, 17, 25, 42, 65, 100, 125, 150, 175, 200];
const INHOLE = [25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 450, 500, 600];

/** Same shape as parseDelays() returns. */
export function demoDelayDb() {
  const detonators = [];
  let seed = 1;
  SURFACE.forEach((ms, i) => detonators.push(device(`SD ${ms}`, i, ms, seed++)));
  detonators.push(device('Leadin', 0, 0, seed++));
  INHOLE.forEach((ms, i) => detonators.push(device(`DH #${i + 1}`, i, ms, seed++)));
  return { title: 'DEMO products (synthetic)', detonators };
}
