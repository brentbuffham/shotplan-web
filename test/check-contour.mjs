import { readFileSync } from 'node:fs';
import { parseXel } from '../src/format/xel.js';
import { recoverKey, parseDelays } from '../src/format/delays.js';
import { computeTimes } from '../src/calc/timing.js';
import { timeField, contours, firstMovement, chooseStep } from '../src/calc/contour.js';

const S='samples/';
const key = recoverKey(new Uint8Array(readFileSync(S+'PRODUCTS.BIN')));
const db = parseDelays(new Uint8Array(readFileSync(S+'DELAYS.BIN')), key);
const load = p => { const b=new Uint8Array(readFileSync(p)); let s=''; for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]); return parseXel(s); };

for (const n of ['TEST3.XEL','OVERBUR.XEL','DHDETC.XEL']) {
  const plan = load(S+n);
  const times = computeTimes(plan, db, { mode: 'mean' });
  const f = timeField(plan, times);
  const c = contours(f);
  const mv = firstMovement(f);
  const dirs = mv.filter(Boolean);
  const avg = dirs.reduce((a,d)=>({x:a.x+d.x,y:a.y+d.y}),{x:0,y:0});
  const bearing = (Math.atan2(avg.x, avg.y) * 180 / Math.PI + 360) % 360;
  console.log(`\n=== ${n} ===`);
  console.log(`  holes in field : ${f.holes.length}, triangles ${f.triangles.length}`);
  console.log(`  time span      : ${times.first.toFixed(0)} .. ${times.last.toFixed(0)} ms`);
  console.log(`  contour step   : ${c.step} ms  -> ${c.levels.length} levels`);
  console.log(`  levels         : ${c.levels.map(l=>l.level).join(', ')}`);
  const segs = c.levels.reduce((a,l)=>a+l.lines.reduce((b,p)=>b+p.length-1,0),0);
  console.log(`  polylines      : ${c.levels.reduce((a,l)=>a+l.lines.length,0)} (${segs} segments)`);
  console.log(`  movement       : ${dirs.length}/${mv.length} holes, mean bearing ${bearing.toFixed(0)} deg`);
}
