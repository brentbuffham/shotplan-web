/**
 * Bench editing checks.
 *
 * The invariant is that crest and foot must stay paired — the file format
 * writes a count for each and every sample has them equal. Add point and
 * Remove point therefore have to touch both lines, while Move point does not,
 * because a battered face is precisely the case where the two differ in
 * position but not in count.
 *
 * Limits are from the overlay: 8 benches (cmp [0x1dec], 8) and 100 points per
 * bench (cmp es:[di], 0x64).
 */
import { readFileSync, existsSync } from 'node:fs';
import { parseXel } from '../src/format/xel.js';
import { writeXel } from '../src/format/xel-write.js';
import {
  addBench, removeBench, addBenchPoint, removeBenchPoint, moveBenchPoint,
  pickBenchPoint, MAX_BENCHES, MAX_BENCH_POINTS, BENCH_FULL, BENCH_TOO_SHORT,
} from '../src/ui/edit.js';

let bad = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}`
    + (ok ? '' : ` (expected ${JSON.stringify(want)})`));
};
const paired = (plan) => plan.benches.every((b) => b.crest.length === b.foot.length);

const line = (n) => Array.from({ length: n }, (_, i) => ({ e: i * 10, n: 0, rl: 0 }));
const blank = () => ({ benches: [] });

console.log('=== creating benches ===');
{
  const p = blank();
  check('one point is not a bench', addBench(p, line(1)).reason, BENCH_TOO_SHORT);
  check('zero points is not a bench', addBench(p, []).reason, BENCH_TOO_SHORT);
  check('two points is one segment', addBench(p, line(2)).ok, true);
  check('foot is a copy of the crest', p.benches[0].foot, p.benches[0].crest);
  check('crest and foot are distinct objects',
    p.benches[0].foot[0] === p.benches[0].crest[0], false);

  while (p.benches.length < MAX_BENCHES) addBench(p, line(2));
  check(`table holds ${MAX_BENCHES}`, p.benches.length, MAX_BENCHES);
  check('ninth bench refused', addBench(p, line(2)).reason, BENCH_FULL);

  const q = blank();
  check(`${MAX_BENCH_POINTS + 1} points refused`,
    addBench(q, line(MAX_BENCH_POINTS + 1)).ok, false);
  check(`${MAX_BENCH_POINTS} points accepted`, addBench(q, line(MAX_BENCH_POINTS)).ok, true);
}

console.log('\n=== point operations keep crest and foot paired ===');
{
  const p = blank();
  addBench(p, line(4));
  // Give the foot a batter so an inserted point has something to interpolate.
  p.benches[0].foot.forEach((q, i) => { q.n = -5; q.e = i * 10 + 2; });

  const before = p.benches[0].crest.length;
  const r = addBenchPoint(p, 0, 1, 15, 0);
  check('point inserted', r.ok, true);
  check('inserted into the chosen segment', r.at, 2);
  check('crest grew by one', p.benches[0].crest.length - before, 1);
  check('still paired', paired(p), true);
  const f = p.benches[0].foot[2];
  check('foot cut at the same fraction along its own segment',
    [Math.round(f.e * 100) / 100, f.n], [17, -5]);

  check('bad segment refused', addBenchPoint(p, 0, 99, 1, 1).ok, false);

  removeBenchPoint(p, 0, 2);
  check('back to the original count', p.benches[0].crest.length, before);
  check('still paired after removal', paired(p), true);

  // A bench must keep at least one segment.
  const q = blank();
  addBench(q, line(2));
  check('cannot remove below two points', removeBenchPoint(q, 0, 0).reason, BENCH_TOO_SHORT);
}

console.log('\n=== move affects one line only ===');
{
  const p = blank();
  addBench(p, line(3));
  moveBenchPoint(p, 0, 1, 99, 99, 'crest');
  check('crest point moved', [p.benches[0].crest[1].e, p.benches[0].crest[1].n], [99, 99]);
  check('foot point did not follow', [p.benches[0].foot[1].e, p.benches[0].foot[1].n], [10, 0]);
  check('counts still paired', paired(p), true);
  const hit = pickBenchPoint(p, 99, 99, 1);
  check('picked the moved crest point', [hit.bench, hit.point, hit.which], [0, 1, 'crest']);
}

console.log('\n=== against a real plan ===');
const S = 'samples/';
if (existsSync(S + 'OVERBUR.XEL')) {
  const b = new Uint8Array(readFileSync(S + 'OVERBUR.XEL'));
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  const plan = parseXel(s);
  check('sample benches start paired', paired(plan), true);
  const n0 = plan.benches.length;
  addBench(plan, line(3));
  addBenchPoint(plan, 0, 0, 1, 1);
  removeBench(plan, n0);
  const re = parseXel(writeXel(plan));
  check('survives write and reparse', paired(re), true);
  check('bench count survives', re.benches.length, plan.benches.length);
  check('edited bench point count survives',
    re.benches[0].crest.length, plan.benches[0].crest.length);
} else {
  console.log('  samples/OVERBUR.XEL not present - skipped');
}

console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);
