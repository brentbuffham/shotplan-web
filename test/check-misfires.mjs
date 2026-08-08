/**
 * Misfires smoke check.
 *
 * Ported from 0x0137F0 in SHOTPLAN.OVR — see the archive's
 * docs/misfires-calculation.md for the trace.
 *
 * Uses a flat 1-per-1000 rate rather than the shipped RELDATA.BIN figures.
 * That is deliberate: ENDURADet's 1/1000 is the only credible number in the
 * shipped database. The rest are placeholders — 100/1000 is a 10% per-device
 * failure rate, and 1000/1000 forces P(blast fires) to zero — so running the
 * real table produces degenerate output that tells you nothing about whether
 * the port is right.
 *
 * Needs samples/, which is untracked.
 */
import { readFileSync, existsSync } from 'node:fs';
import { parseXel } from '../src/format/xel.js';
import { recoverKey, parseDelays } from '../src/format/delays.js';
import { computeTimes } from '../src/calc/timing.js';
import { computeMisfires, orphanedHoles, buildGraph } from '../src/calc/misfires.js';

const S = 'samples/';
if (!existsSync(S + 'DELAYS.BIN')) {
  console.log('samples/ not present - skipping');
  process.exit(0);
}

const key = recoverKey(new Uint8Array(readFileSync(S + 'PRODUCTS.BIN')));
const db = parseDelays(new Uint8Array(readFileSync(S + 'DELAYS.BIN')), key);
const load = (p) => {
  const b = new Uint8Array(readFileSync(p));
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return parseXel(s);
};

const RATE = () => 1;   // per 1000

for (const n of ['TEST3.XEL', 'TEST4.XEL', 'OVERBUR.XEL', 'DHDETC.XEL']) {
  if (!existsSync(S + n)) continue;
  const plan = load(S + n);
  const times = computeTimes(plan, db, { mode: 'mean' });
  const r = computeMisfires(plan, times, RATE);
  console.log(`\n=== ${n} ===`);
  if (!r.ok) { console.log('  refused:', r.reason); continue; }
  console.log(`  holes firing            : ${r.holesFiring}`);
  console.log(`  surface devices         : ${r.surfaceDevices}`);
  console.log(`  one device misfire rate : ${r.oneDeviceMisfireRate.toFixed(2)} /1000`);
  console.log(`  blast misfire rate      : ${(r.blastMisfireRate * 100).toFixed(2)} %`);
  console.log(`  average misfire         : ${r.averageMisfirePct.toFixed(3)} %`);
  console.log(`  failure combinations    : ${r.outcomes.length}`
    + ` (${r.outcomes.filter((o) => o.cut.length === 1).length} single,`
    + ` ${r.outcomes.filter((o) => o.cut.length === 2).length} pair)`);
  const worst = r.outcomes.slice().sort((a, b) => b.orphaned - a.orphaned)[0];
  if (worst) {
    console.log(`  worst single outcome    : ties [${worst.cut.join(', ')}]`
      + ` orphan ${worst.orphaned}/${r.holesFiring} holes`
      + ` (${(worst.orphaned / r.holesFiring * 100).toFixed(0)}% of blast)`);
  }
  const occupied = r.bins.filter((b) => b > 0).length;
  console.log(`  histogram               : ${occupied}/40 bins occupied`);

  // Sanity: cutting nothing must orphan nothing, and the probability mass of
  // every enumerated outcome must stay below 1.
  const g = buildGraph(plan, times);
  const base = orphanedHoles(g, []);
  const mass = r.outcomes.reduce((s, o) => s + o.prob, 0);
  console.log(`  checks                  : no-cut orphans ${base} (expect 0),`
    + ` mass ${mass.toFixed(6)} (expect < 1)`);
  if (base !== 0 || mass >= 1) { console.log('  FAIL'); process.exitCode = 1; }
}
