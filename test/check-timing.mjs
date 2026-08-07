import { readFileSync } from 'node:fs';
import { parseXel, liveHoles } from '../src/format/xel.js';
import { recoverKey, parseDelays } from '../src/format/delays.js';
import { computeTimes, initiationHoles, maxOverlap } from '../src/calc/timing.js';

const S = 'samples/';
const A = 'C:/Users/brent/Desktop/git/shotplan-archive/';

const key = recoverKey(new Uint8Array(readFileSync(S + 'PRODUCTS.BIN')));
const db = parseDelays(new Uint8Array(readFileSync(S + 'DELAYS.BIN')), key);

function load(p) {
  const b = new Uint8Array(readFileSync(p));
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return parseXel(s);
}

for (const [name, path] of [['TEST3.XEL', S + 'TEST3.XEL'],
                            ['DHDETC.XEL', A + 'DHDETC.XEL'],
                            ['TERIBAL.XEL', A + 'TERIBAL.XEL'],
                            ['COMPARE.XEL', A + 'COMPARE.XEL']]) {
  const plan = load(path);
  const live = liveHoles(plan).length;
  const starts = initiationHoles(plan);
  const nom = computeTimes(plan, db, { mode: 'nominal' });
  const mean = computeTimes(plan, db, { mode: 'mean' });
  console.log(`\n=== ${name} — ${live} live holes, ${plan.links.length} ties ===`);
  console.log(`  initiation holes : ${starts.join(', ') || '(none)'}`);
  if (nom.missing.length) console.log(`  UNRESOLVED products: ${nom.missing.join(', ')}`);
  console.log(`  unreached holes  : ${nom.unreached.length}`);
  console.log(`  nominal: first ${nom.first.toFixed(1)} last ${nom.last.toFixed(1)} duration ${nom.duration.toFixed(1)} ms`);
  console.log(`  mean   : first ${mean.first.toFixed(1)} last ${mean.last.toFixed(1)} duration ${mean.duration.toFixed(1)} ms`);
  console.log(`  max holes in any 8ms window (nominal): ${maxOverlap([...nom.fire.values()], 8)}`);

  // Monte Carlo: how often do the first two holes in nominal order reverse?
  if (nom.order.length >= 2) {
    const a = nom.order[0].index + 1, b = nom.order[1].index + 1;
    let rev = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const s = computeTimes(plan, db, { mode: 'sample' });
      if (s.fire.get(a) > s.fire.get(b)) rev++;
    }
    const gap = nom.fire.get(b) - nom.fire.get(a);
    console.log(`  holes ${a} and ${b}: nominal gap ${gap.toFixed(1)} ms -> reversal in ${(100*rev/N).toFixed(1)}% of ${N} sims`);
  }
}
