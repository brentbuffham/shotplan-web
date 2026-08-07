/**
 * v3.0 reports TEST3.XEL as first 25.0, last 333.0, duration 308.0.
 * Find which surface-detonator indexing reproduces that.
 */
import { readFileSync } from 'node:fs';
import { parseXel } from '../src/format/xel.js';
import { recoverKey, parseDelays } from '../src/format/delays.js';
import { resolveDetonators, initiationHoles } from '../src/calc/timing.js';
import { liveHoles } from '../src/format/xel.js';

const S = 'samples/';
const key = recoverKey(new Uint8Array(readFileSync(S + 'PRODUCTS.BIN')));
const db = parseDelays(new Uint8Array(readFileSync(S + 'DELAYS.BIN')), key);
const b = new Uint8Array(readFileSync(S + 'TEST3.XEL'));
let txt = '';
for (let i = 0; i < b.length; i++) txt += String.fromCharCode(b[i]);
const plan = parseXel(txt);

const det = resolveDetonators(plan, db);
console.log('surface slots:');
det.surface.forEach((d, i) => console.log(`  [${i}] ${d ? d.name.padEnd(9) + ' nom=' + d.nominal : '(undefined)'}`));
console.log('in-hole slots:');
det.inHole.slice(0, 4).forEach((d, i) => console.log(`  [${i}] ${d ? d.name.padEnd(9) + ' nom=' + d.nominal : '(undefined)'}`));
console.log('link types used:', [...new Set(plan.links.map(l => l.type))].sort().join(', '));
console.log('hole delay numbers used:', [...new Set(liveHoles(plan).map(h => h.delay))].sort().join(', '));
console.log();

function run(surfaceShift, inHoleShift) {
  const byIndex = new Map(plan.holes.map((h) => [h.index + 1, h]));
  const out = new Map();
  for (const l of plan.links) {
    if (!byIndex.has(l.hole1) || !byIndex.has(l.hole2)) continue;
    const d = det.surface[l.type + surfaceShift];
    if (!out.has(l.hole1)) out.set(l.hole1, []);
    out.get(l.hole1).push({ to: l.hole2, delay: d ? d.nominal : 0 });
  }
  const arrival = new Map();
  for (const s of initiationHoles(plan)) arrival.set(s, 0);
  const settled = new Set();
  for (;;) {
    let best = null, bt = Infinity;
    for (const [h, t] of arrival) if (!settled.has(h) && t < bt) { bt = t; best = h; }
    if (best === null) break;
    settled.add(best);
    for (const e of out.get(best) ?? []) {
      const t = bt + e.delay;
      if (!arrival.has(e.to) || t < arrival.get(e.to)) arrival.set(e.to, t);
    }
  }
  const fire = [];
  for (const h of liveHoles(plan)) {
    const k = h.index + 1;
    if (!arrival.has(k)) continue;
    const d = det.inHole[h.delay + inHoleShift];
    fire.push(arrival.get(k) + (d ? d.nominal : 0));
  }
  if (!fire.length) return null;
  return { first: Math.min(...fire), last: Math.max(...fire), n: fire.length };
}

console.log('target: first 25.0  last 333.0  duration 308.0');
console.log();
for (const ss of [0, -1, -2]) {
  for (const is of [0, -1]) {
    const r = run(ss, is);
    if (!r) continue;
    const hit = Math.abs(r.last - 333) < 0.5 && Math.abs(r.first - 25) < 0.5;
    console.log(`  surface[type${ss ? ss : ''}] inHole[delay${is ? is : ''}]  ->`
      + ` first ${r.first.toFixed(1).padStart(6)} last ${r.last.toFixed(1).padStart(7)}`
      + ` duration ${(r.last - r.first).toFixed(1).padStart(7)}  ${hit ? '  <== MATCH' : ''}`);
  }
}
