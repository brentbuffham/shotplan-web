/**
 * Pattern generation checks.
 *
 * The real test is not that the generator produces a tidy grid — it is that it
 * reproduces a pattern SHOTPlan itself generated. DHDETC.XEL is a single
 * pattern covering the whole plan (10 rows x 20, staggered, spacing 3.6,
 * burden 2.8), so regenerating it from its own stored parameters and comparing
 * against the 200 real holes settles the geometry outright.
 */
import { readFileSync, existsSync } from 'node:fs';
import { parseXel } from '../src/format/xel.js';
import {
  patternPositions, bearingBetween, addPattern, sizeFromCursor,
  SQUARE, STAGGERED, PATTERN_DEFAULTS,
} from '../src/calc/pattern.js';

let bad = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}`
    + (ok ? '' : ` (expected ${JSON.stringify(want)})`));
};

console.log('=== geometry ===');
{
  const p = { ...PATTERN_DEFAULTS, type: SQUARE, nRows: 2, nInRow: 3, spacing: 5, burden: 4 };
  const pts = patternPositions(p, { e: 0, n: 0 }, 90, 1);   // first row due east
  check('hole count is rows x perRow', pts.length, 6);
  check('row 1 runs east at the spacing',
    pts.slice(0, 3).map((q) => [+q.e.toFixed(3), +q.n.toFixed(3)]),
    [[0, 0], [5, 0], [10, 0]]);
  check('row 2 is one burden away, unshifted for SQUARE',
    pts.slice(3).map((q) => [+q.e.toFixed(3), +q.n.toFixed(3)]),
    [[0, -4], [5, -4], [10, -4]]);

  const st = patternPositions({ ...p, type: STAGGERED }, { e: 0, n: 0 }, 90, 1);
  check('STAGGERED shifts row 2 by half a spacing',
    st.slice(3).map((q) => [+q.e.toFixed(3), +q.n.toFixed(3)]),
    [[2.5, -4], [7.5, -4], [12.5, -4]]);

  check('side flips which way rows grow',
    patternPositions(p, { e: 0, n: 0 }, 90, -1)[3].n, 4);
  check('bearing 0 runs north',
    patternPositions(p, { e: 0, n: 0 }, 0, 1).slice(0, 2)
      .map((q) => [+q.e.toFixed(3), +q.n.toFixed(3)]), [[0, 0], [0, 5]]);
}

console.log('\n=== reproducing a pattern SHOTPlan generated ===');
const S = 'samples/';
if (existsSync(S + 'DHDETC.XEL')) {
  const b = new Uint8Array(readFileSync(S + 'DHDETC.XEL'));
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  const plan = parseXel(s);
  const rec = plan.patternTable.patterns[0];
  const first = rec.firstHole;
  const holes = plan.holes.slice(first - 1, first - 1 + rec.nRows * rec.nInRow);

  check('one pattern record', plan.patternTable.patterns.length, 1);
  check('covers every live hole', holes.length, plan.holes.filter((h) => h.live).length);
  check('every hole carries pattern id + 1',
    [...new Set(holes.map((h) => h.kind))], [plan.patternTable.freeIndex]);

  // Take origin and bearing from the plan itself; everything else is stored.
  const origin = { e: holes[0].e, n: holes[0].n };
  const bearing = bearingBetween(holes[0], holes[1]);
  check('first row bearing', +bearing.toFixed(2), 90);

  // The stored fields: burden is perpendicular, spacing is along the row.
  const params = {
    type: rec.type, nRows: rec.nRows, nInRow: rec.nInRow,
    spacing: rec.spacing, burden: rec.burden,
  };
  // `side` is not stored; pick the one that matches and report it.
  let best = null;
  for (const side of [1, -1]) {
    const gen = patternPositions(params, origin, bearing, side);
    const err = Math.max(...gen.map((g, i) => Math.hypot(g.e - holes[i].e, g.n - holes[i].n)));
    if (!best || err < best.err) best = { side, err, gen };
  }
  console.log(`  side ${best.side} fits; worst error from STORED params `
    + `${(best.err * 1000).toFixed(0)} mm`);
  check('regenerates all 200 holes to within 100 mm', best.err < 0.1, true);
  check('type is STAGGERED', rec.type, STAGGERED);

  // That residual is not the geometry: the pattern RECORD is rounded to one
  // decimal while the hole coordinates keep full precision. Measure what the
  // holes actually use and the error should collapse.
  const d = (a, c) => Math.hypot(a.e - c.e, a.n - c.n);
  const trueSpacing = d(holes[0], holes[1]);
  const u = { e: (holes[1].e - holes[0].e) / trueSpacing, n: (holes[1].n - holes[0].n) / trueSpacing };
  const step = { e: holes[rec.nInRow].e - holes[0].e, n: holes[rec.nInRow].n - holes[0].n };
  const trueBurden = Math.abs(step.e * -u.n + step.n * u.e);
  console.log(`  stored  spacing ${rec.spacing} burden ${rec.burden}`);
  console.log(`  actual  spacing ${trueSpacing.toFixed(4)} burden ${trueBurden.toFixed(4)}`);
  check('stored values are the actual ones rounded to 1 dp',
    [+trueSpacing.toFixed(1), +trueBurden.toFixed(1)], [rec.spacing, rec.burden]);

  const exact = patternPositions(
    { ...params, spacing: trueSpacing, burden: trueBurden }, origin, bearing, best.side);
  const err2 = Math.max(...exact.map((g, i) => Math.hypot(g.e - holes[i].e, g.n - holes[i].n)));
  console.log(`  worst error from MEASURED params ${(err2 * 1000).toFixed(1)} mm`);
  check('geometry reproduces all 200 holes to within 1 mm', err2 < 0.001, true);
} else {
  console.log('  samples/DHDETC.XEL not present - skipped');
}

console.log('\n=== adding a pattern to a plan ===');
{
  const plan = {
    holes: [], links: [], benches: [], boundary: [], texts: [],
    tables: { nHoleRecords: 0, nBlastHoles: 0, nLinks: 0, holeFreePtr: 0 },
    patternTable: { freeIndex: 1, selected: 1, patterns: [] },
  };
  const r = addPattern(plan, { ...PATTERN_DEFAULTS, nRows: 3, nInRow: 4 },
    { e: 0, n: 0 }, 45, 1);
  check('added', r.ok, true);
  check('12 holes', r.count, 12);
  check('first hole record is 1', r.first, 1);
  check('pattern id 1', r.patternId, 1);
  check('holes carry kind = id + 1', [...new Set(plan.holes.map((h) => h.kind))], [2]);
  check('record stores the first hole', plan.patternTable.patterns[0].firstHole, 1);
  check('next free index advanced', plan.patternTable.freeIndex, 2);
  check('blast-hole count', plan.tables.nBlastHoles, 12);

  // A second pattern must sit after the first, contiguously.
  const r2 = addPattern(plan, { ...PATTERN_DEFAULTS, nRows: 2, nInRow: 2 },
    { e: 100, n: 100 }, 0, 1);
  check('second pattern starts after the first', r2.first, 13);
  check('and gets the next id', r2.patternId, 2);
  check('its holes carry kind 3', plan.holes[12].kind, 3);
  check('runs stay contiguous',
    plan.holes.slice(0, 12).every((h) => h.kind === 2)
    && plan.holes.slice(12).every((h) => h.kind === 3), true);
}

console.log('\n=== expand / contract ===');
{
  const p = { ...PATTERN_DEFAULTS, nInRow: 5, spacing: 4, burden: 3 };
  // Nominal reach of the first row is (5-1) * 4 = 16 m.
  const same = sizeFromCursor(p, { e: 0, n: 0 }, { e: 16, n: 0 });
  check('cursor at the nominal reach leaves it unchanged', +same.factor.toFixed(6), 1);
  const big = sizeFromCursor(p, { e: 0, n: 0 }, { e: 32, n: 0 });
  check('twice the reach doubles both', [big.spacing, big.burden], [8, 6]);
}

console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);
