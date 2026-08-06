/**
 * Parse every .XEL in a directory and report what came back.
 *
 * Sample plans are not in this repository — they embed a third party's product
 * database. Point this at a local archive:
 *
 *   node test/validate-samples.js /path/to/archive
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseXel, liveHoles, dummyHoles, holeChain } from '../src/format/xel.js';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node test/validate-samples.js <dir-with-xel-files>');
  process.exit(2);
}

const files = readdirSync(dir).filter((f) => /\.xel$/i.test(f)).sort();
if (!files.length) {
  console.error(`no .XEL files in ${dir}`);
  process.exit(2);
}

let ok = 0;
let failed = 0;

console.log(
  'file'.padEnd(26) + 'holes'.padStart(7) + 'live'.padStart(6) + 'dumy'.padStart(6) +
  'links'.padStart(7) + 'bnch'.padStart(6) + 'bnd'.padStart(5) +
  'dck'.padStart(5) + 'txt'.padStart(5) + '  title'
);
console.log('-'.repeat(96));

for (const f of files) {
  const path = join(dir, f);
  try {
    const plan = parseXel(readFileSync(path, 'latin1'));
    const live = liveHoles(plan);
    console.log(
      f.padEnd(26) +
      String(plan.holes.length).padStart(7) +
      String(live.length).padStart(6) + String(dummyHoles(plan).length).padStart(6) +
      String(plan.links.length).padStart(7) +
      String(plan.benches.length).padStart(6) +
      String(plan.boundary.length).padStart(5) +
      String(plan.decking.length).padStart(5) +
      String(plan.texts.length).padStart(5) +
      '  ' + plan.title
    );

    // Cross-checks against the file's own declared counts.
    const notes = [];
    if (plan.tables.nBlastHoles !== live.length) {
      notes.push(`header says ${plan.tables.nBlastHoles} blast holes, found ${live.length} live`);
    }
    if (live.length && holeChain(plan) === null) {
      notes.push('hole storage chain does not cover every live hole');
    }
    const undefRL = plan.holes.filter((h) => h.rl === null).length;
    if (undefRL && undefRL !== plan.holes.length) {
      notes.push(`${undefRL}/${plan.holes.length} holes have undefined RL`);
    }
    for (const n of notes) console.log(' '.repeat(26) + '  note: ' + n);
    ok++;
  } catch (e) {
    console.log(f.padEnd(26) + '  FAILED: ' + e.message);
    failed++;
  }
}

console.log('-'.repeat(96));
console.log(`${ok} parsed, ${failed} failed`);
process.exit(failed ? 1 : 0);
