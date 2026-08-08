/**
 * Add/remove hole checks, focused on the free list.
 *
 * The free list is the part that is invisible in the app and corrupting in the
 * file. A deleted record is marked kind < 0 and linked through its own fLink,
 * with tables.holeFreePtr as the head — verified against the samples, where
 * the chain walks every deleted record exactly once (7/7, 17/17, 53/53, 56/56).
 * Reading -kind as the link instead, which the parser used to claim, makes the
 * chain point at itself.
 *
 * Needs samples/, which is untracked.
 */
import { readFileSync, existsSync } from 'node:fs';
import { parseXel } from '../src/format/xel.js';
import { writeXel } from '../src/format/xel-write.js';
import { addHole, addDummyHole, removeHole } from '../src/ui/edit.js';

const S = 'samples/';
const load = (p) => {
  const b = new Uint8Array(readFileSync(p));
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return parseXel(s);
};

let bad = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}`
    + (ok ? '' : ` (expected ${JSON.stringify(want)})`));
};

/** Walk the free list and return the record numbers on it. */
function freeChain(plan) {
  const by = new Map(plan.holes.map((h) => [h.index + 1, h]));
  const out = [];
  let p = plan.tables.holeFreePtr | 0;
  let guard = 0;
  while (p > 0 && guard++ < 1000) {
    const h = by.get(p);
    if (!h || !h.deleted) { out.push(`${p}:BROKEN`); break; }
    out.push(p);
    p = h.freeLink | 0;
  }
  return out;
}

// Pick one sample of each kind rather than assuming. TEST4 carries 53 deleted
// records; DHDETC has none.
const withFree = ['TEST4.XEL', 'OVERBUR.XEL'].find((f) =>
  existsSync(S + f) && load(S + f).tables.holeFreePtr > 0);
const noFree = ['DHDETC.XEL', 'TEST3.XEL', 'COMPARE.XEL'].find((f) =>
  existsSync(S + f) && load(S + f).tables.holeFreePtr === 0);
const file = withFree ?? noFree;
if (!file) { console.log('samples/ not present - skipping'); process.exit(0); }

// --- no free list: adding must extend the table ----------------------------
if (noFree) {
  console.log(`=== ${noFree} (no deleted records) ===`);
  const plan = load(S + noFree);
  const before = plan.holes.length;
  const liveBefore = plan.tables.nBlastHoles;
  check('starts with an empty free list', freeChain(plan), []);
  const r = addHole(plan, 100, 200, 5, { delay: 3 });
  check('appended rather than reused', r.reused, false);
  check('record count grew by one', plan.holes.length - before, 1);
  check('blast-hole count grew by one', plan.tables.nBlastHoles - liveBefore, 1);

  removeHole(plan, r.index);
  check('record kept, not spliced out', plan.holes.length - before, 1);
  check('free list now holds it', freeChain(plan), [r.index]);
  check('blast-hole count back to the start', plan.tables.nBlastHoles, liveBefore);

  const r2 = addHole(plan, 101, 201, 5);
  check('next add reused it', r2.reused, true);
  check('same record number', r2.index, r.index);
  check('free list empty again', freeChain(plan), []);
  check('table did not grow twice', plan.holes.length - before, 1);
}

// --- an existing free list must be popped, head first ----------------------
if (withFree) {
  console.log(`\n=== ${withFree} (has a free list) ===`);
  const plan = load(S + withFree);
  const chain0 = freeChain(plan);
  const before = plan.holes.length;
  check('chain is intact to start with', chain0.some((x) => String(x).includes('BROKEN')), false);
  check('chain covers every deleted record',
    chain0.length, plan.holes.filter((h) => h.deleted).length);

  const head = chain0[0];
  const r = addHole(plan, 500, 600, 9);
  check('reused rather than appended', r.reused, true);
  check('took the head of the chain', r.index, head);
  check('table did not grow', plan.holes.length, before);
  check('chain is now the tail', freeChain(plan), chain0.slice(1));

  removeHole(plan, r.index);
  check('removal pushes it back on the head', freeChain(plan), chain0);
}

// --- a dummy hole is a record but not a blast hole --------------------------
console.log('\n=== dummy holes ===');
{
  const plan = load(S + file);
  const liveBefore = plan.tables.nBlastHoles;
  const r = addDummyHole(plan, 10, 20, 0);
  const rec = plan.holes[r.index - 1];
  check('kind is 0', rec.kind, 0);
  check('not counted as a blast hole', plan.tables.nBlastHoles, liveBefore);
  check('flagged dummy, not live', [rec.dummy, rec.live], [true, false]);
}

// --- the chain must survive a write/reparse --------------------------------
console.log('\n=== round trip through the writer ===');
{
  const plan = load(S + file);
  const a = addHole(plan, 300, 400, 7);
  removeHole(plan, a.index);
  const b = addHole(plan, 301, 401, 7);
  removeHole(plan, b.index);
  const expected = freeChain(plan);
  const reparsed = parseXel(writeXel(plan));
  check('free list survives write + reparse', freeChain(reparsed), expected);
  check('record count survives', reparsed.holes.length, plan.holes.length);
  check('blast-hole count survives', reparsed.tables.nBlastHoles, plan.tables.nBlastHoles);
}

// --- removing a hole must not leave dangling ties ---------------------------
console.log('\n=== ties on a removed hole ===');
{
  const plan = load(S + file);
  const victim = plan.links[0]?.hole1;
  if (victim) {
    const touching = plan.links.filter((l) => l.hole1 === victim || l.hole2 === victim).length;
    const before = plan.links.length;
    removeHole(plan, victim);
    check('ties on the hole were removed', before - plan.links.length, touching);
    check('no tie still references it',
      plan.links.some((l) => l.hole1 === victim || l.hole2 === victim), false);
    check('link count header agrees', plan.tables.nLinks, plan.links.length);
  }
}

console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);
