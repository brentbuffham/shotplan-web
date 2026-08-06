/** Probe hole flag-field distributions against each file's declared counts. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseXel } from '../src/format/xel.js';

const dir = process.argv[2];
for (const f of readdirSync(dir).filter((x) => /\.xel$/i.test(x)).sort()) {
  const plan = parseXel(readFileSync(join(dir, f), 'latin1'));
  if (!plan.holes.length) continue;
  const kind = {};
  const flag = {};
  const combo = {};
  for (const h of plan.holes) {
    kind[h.kind] = (kind[h.kind] || 0) + 1;
    flag[h.flag] = (flag[h.flag] || 0) + 1;
    const key = `${h.kind}/${h.flag}`;
    combo[key] = (combo[key] || 0) + 1;
  }
  console.log(`${f}  records=${plan.holes.length}  hdr[4]=${plan.tables.nBlastHoles}`);
  console.log(`   kind:  ${JSON.stringify(kind)}`);
  console.log(`   flag:  ${JSON.stringify(flag)}`);
  console.log(`   kind/flag: ${JSON.stringify(combo)}`);
  // which subset equals hdr[4]?
  for (const [k, n] of Object.entries(combo)) {
    if (n === plan.tables.nBlastHoles) console.log(`   >>> kind/flag ${k} count == hdr[4]`);
  }
  for (const [k, n] of Object.entries(kind)) {
    if (n === plan.tables.nBlastHoles) console.log(`   >>> kind ${k} count == hdr[4]`);
  }
  console.log();
}
