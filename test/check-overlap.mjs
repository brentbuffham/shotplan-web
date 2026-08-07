import { readFileSync } from 'node:fs';
import { parseXel, liveHoles } from '../src/format/xel.js';
import { recoverKey, parseDelays } from '../src/format/delays.js';
import { adjacency, overlapProbabilities, bandOf, BANDS } from '../src/calc/overlap.js';

const S = 'samples/';
const A = 'C:/Users/brent/Desktop/git/shotplan-archive/';
const key = recoverKey(new Uint8Array(readFileSync(S + 'PRODUCTS.BIN')));
const db = parseDelays(new Uint8Array(readFileSync(S + 'DELAYS.BIN')), key);
const load = (p) => {
  const b = new Uint8Array(readFileSync(p));
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return parseXel(s);
};

for (const [name, path] of [['TEST3.XEL', S + 'TEST3.XEL'],
                            ['DHDETC.XEL', A + 'DHDETC.XEL'],
                            ['OVERBUR.XEL', A + 'OVERBUR.XEL']]) {
  const plan = load(path);
  const adj = adjacency(plan);
  const t0 = Date.now();
  const res = overlapProbabilities(plan, db, { trials: 200 });
  const ms = Date.now() - t0;

  const counts = new Array(BANDS.length + 1).fill(0);
  for (const e of res.edges) {
    const b = bandOf(e.reversal);
    counts[b < 0 ? BANDS.length : b]++;
  }
  console.log(`\n=== ${name} — ${liveHoles(plan).length} live holes ===`);
  console.log(`  triangulation: ${adj.edges.length} adjacent pairs (${ms} ms for 200 trials)`);
  console.log('  out-of-sequence bands:');
  BANDS.forEach((b, i) => console.log(`     ${b.label.padStart(5)}  ${counts[i]}`));
  console.log(`     <.1%   ${counts[BANDS.length]}`);
  const worst = [...res.edges].sort((x, y) => y.reversal - x.reversal).slice(0, 3);
  for (const w of worst) {
    console.log(`     worst pair: gap ${w.gap.toFixed(1)} ms -> reversal ${(w.reversal * 100).toFixed(1)}%`
      + `  crowding ${(w.crowding * 100).toFixed(1)}%`);
  }
}
