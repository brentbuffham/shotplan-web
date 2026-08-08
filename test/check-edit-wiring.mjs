/**
 * Edit-mode wiring: drive the Shell the way the mouse does.
 *
 * The plan operations have their own checks. This one is about the
 * interaction, which is the part actually being preserved — the pointer
 * carries the mode, Left/INS acts and Right/DEL finishes, and the parent menu
 * decides what an ambiguous item like "Bench" means.
 *
 * Runs headless: nothing here touches a canvas.
 */
import { readFileSync, existsSync } from 'node:fs';
import { parseXel, planBounds } from '../src/format/xel.js';
import { Shell } from '../src/ui/shell.js';
import { itemsOf } from '../src/ui/menus.js';
import { PLOT } from '../src/render/view.js';
import {
  ADD_HOLE_PROMPT, ADD_DUMMY_PROMPT, BENCH_PROMPT_MARK,
  HOLE_REMOVE_PROMPT, BENCH_REMOVE_PROMPT, BENCH_TOO_SHORT,
} from '../src/ui/edit.js';

let bad = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}`
    + (ok ? '' : ` (expected ${JSON.stringify(want)})`));
};

const S = 'samples/';
const file = ['TEST3.XEL', 'TEST4.XEL', 'DHDETC.XEL'].find((f) => existsSync(S + f));
if (!file) { console.log('samples/ not present - skipping'); process.exit(0); }
const raw = new Uint8Array(readFileSync(S + file));
let str = '';
for (let i = 0; i < raw.length; i++) str += String.fromCharCode(raw[i]);

/** A shell with the plan loaded, in edit mode, fitted so the plot maps. */
function shellWith() {
  const sh = new Shell();
  sh.plan = parseXel(str);
  sh.view.overview(planBounds(sh.plan), sh.plan);
  sh.enterEditMode();
  return sh;
}
// A point comfortably inside the plot frame.
const CX = (PLOT.x0 + PLOT.x1) >> 1;
const CY = (PLOT.y0 + PLOT.y1) >> 1;

/**
 * Choose Edit > <parent> > <item> through the real dispatch.
 *
 * The parent is resolved by the shell from openMenu/openSub rather than
 * passed in, so the test has to open the menu the way a click would. That is
 * the point: "Bench" under Add and under Remove are different operations and
 * only the open submenu distinguishes them.
 */
function choose(sh, parent, label) {
  const bar = sh.menus.findIndex((m) => m.label === parent);
  if (bar < 0) throw new Error(`no Edit menu named ${parent}`);
  sh.openMenu = bar;
  const items = itemsOf(sh.menus[bar]);
  const idx = items.findIndex((it) => (it.label ?? it) === label);
  if (idx < 0) throw new Error(`${parent} has no item ${label}`);
  // The Edit menus list plain strings; activate() wants an item object.
  const item = typeof items[idx] === 'string' ? { label } : items[idx];
  // The edit bar is two levels deep, so there is no submenu: the real click
  // path leaves openSub at -1 and passes the BAR label as menuLabel.
  sh.openSub = -1;
  sh.activate(item, parent);
}

console.log(`=== ${file}: Add > Hole ===`);
{
  const sh = shellWith();
  choose(sh, 'Add', 'Hole');
  check('operation armed', sh.editOp, 'Hole');
  check('prompt is the original wording', sh.statusLine(), ADD_HOLE_PROMPT);
  const before = sh.plan.holes.length;
  const live = sh.plan.tables.nBlastHoles;
  sh.leftClick(CX, CY);
  check('a hole was added', sh.plan.holes.length - before, 1);
  check('counted as a blast hole', sh.plan.tables.nBlastHoles - live, 1);
  sh.leftClick(CX + 20, CY + 10);
  check('stays armed for the next hole', sh.plan.holes.length - before, 2);
  sh.rightClick(CX, CY);
  check('Right/DEL finishes', sh.editOp, null);
  check('still in edit mode', sh.editMode, true);
}

console.log('\n=== Add > Dummy hole ===');
{
  const sh = shellWith();
  choose(sh, 'Add', 'Dummy hole');
  check('prompt', sh.statusLine(), ADD_DUMMY_PROMPT);
  const live = sh.plan.tables.nBlastHoles;
  sh.leftClick(CX, CY);
  const added = sh.plan.holes[sh.plan.holes.length - 1];
  check('kind 0', added.kind, 0);
  check('not counted as a blast hole', sh.plan.tables.nBlastHoles, live);
}

console.log('\n=== Add > Bench: Right/DEL commits ===');
{
  const sh = shellWith();
  choose(sh, 'Add', 'Bench');
  check('prompt', sh.statusLine(), BENCH_PROMPT_MARK);
  const before = sh.plan.benches.length;
  sh.leftClick(CX - 40, CY);
  sh.leftClick(CX, CY);
  sh.leftClick(CX + 40, CY);
  check('nothing created while marking', sh.plan.benches.length, before);
  check('three points held', sh.benchPoints.length, 3);
  sh.rightClick(CX, CY);
  check('bench created on finish', sh.plan.benches.length - before, 1);
  const b = sh.plan.benches[sh.plan.benches.length - 1];
  check('three crest points', b.crest.length, 3);
  check('foot paired with crest', b.foot.length, b.crest.length);
  check('marking state cleared', sh.benchPoints.length, 0);
  check('operation finished', sh.editOp, null);
}

console.log('\n=== Add > Bench: one point is not a bench ===');
{
  const sh = shellWith();
  choose(sh, 'Add', 'Bench');
  const before = sh.plan.benches.length;
  sh.leftClick(CX, CY);
  sh.rightClick(CX, CY);
  check('no bench created', sh.plan.benches.length, before);
  check('and it says why', sh.status, BENCH_TOO_SHORT);
}

console.log('\n=== Remove: the parent decides ===');
{
  const sh = shellWith();
  choose(sh, 'Remove', 'Holes');
  check('Remove > Holes arms a removal', sh.editOp, 'HoleRemove');
  check('prompt', sh.statusLine(), HOLE_REMOVE_PROMPT);

  // Add a bench so Remove > Bench has something to work on.
  const sh2 = shellWith();
  choose(sh2, 'Add', 'Bench');
  sh2.leftClick(CX - 40, CY);
  sh2.leftClick(CX + 40, CY);
  sh2.rightClick(CX, CY);
  const n = sh2.plan.benches.length;
  choose(sh2, 'Remove', 'Bench');
  check('Remove > Bench does NOT start an Add', sh2.editOp, 'BenchRemove');
  check('prompt', sh2.statusLine(), BENCH_REMOVE_PROMPT);
  sh2.leftClick(CX - 40, CY);
  check('bench removed by clicking a point on it', sh2.plan.benches.length, n - 1);
}

console.log('\n=== Remove > Bench with no benches refuses up front ===');
{
  const sh = shellWith();
  sh.plan.benches = [];
  choose(sh, 'Remove', 'Bench');
  check('not armed', sh.editOp, null);
  check('says so', sh.status, 'There are no benches present to be deleted.');
}

console.log('\n=== Add > Tie still arms (regression) ===');
{
  // The edit bar is two levels deep, so `parent` is null here and the handler
  // has to fall back to the bar label. Testing `parent` alone made every edit
  // item report "not implemented yet" — including Tie, which was already
  // wired and working. Worth a check of its own so it cannot go quiet again.
  const sh = shellWith();
  choose(sh, 'Add', 'Tie');
  check('armed', sh.editOp, 'Tie');
  check('no "not implemented" message', /not implemented/.test(sh.status), false);
  choose(sh, 'Remove', 'Tie');
  check('Remove > Tie is a different operation', sh.editOp, 'TieRemove');
  choose(sh, 'Change', 'Tie');
  check('Change > Tie is a third', sh.editOp, 'TieChange');
}

console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);
