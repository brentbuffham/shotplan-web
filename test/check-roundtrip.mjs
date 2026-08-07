/** parse -> write -> parse must preserve every field that matters. */
import { readFileSync, readdirSync } from 'node:fs';
import { parseXel, liveHoles } from '../src/format/xel.js';
import { writeXel } from '../src/format/xel-write.js';

const dir = process.argv[2] ?? 'samples';
let bad = 0;
for (const f of readdirSync(dir).filter((x) => /\.xel$/i.test(x)).sort()) {
  const b = new Uint8Array(readFileSync(dir + '/' + f));
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  const a = parseXel(s);
  const c = parseXel(writeXel(a));
  const issues = [];
  const eq = (x, y, n, tol = 0) => {
    if (x === null && y === null) return;
    if (typeof x === 'number' && typeof y === 'number') {
      if (Math.abs(x - y) > tol) issues.push(`${n}: ${x} != ${y}`);
    } else if (x !== y) issues.push(`${n}: ${JSON.stringify(x)} != ${JSON.stringify(y)}`);
  };
  eq(a.title, c.title, 'title');
  eq(a.holes.length, c.holes.length, 'holes');
  eq(a.links.length, c.links.length, 'links');
  eq(a.benches.length, c.benches.length, 'benches');
  eq(a.boundary.length, c.boundary.length, 'boundary');
  eq(a.texts.length, c.texts.length, 'texts');
  eq(a.detonators.length, c.detonators.length, 'detonators');
  eq(liveHoles(a).length, liveHoles(c).length, 'live holes');
  for (let i = 0; i < Math.min(a.holes.length, c.holes.length); i++) {
    const x = a.holes[i], y = c.holes[i];
    eq(x.e, y.e, `hole${i}.e`, 1e-4); eq(x.n, y.n, `hole${i}.n`, 1e-4);
    eq(x.kind, y.kind, `hole${i}.kind`); eq(x.delay, y.delay, `hole${i}.delay`);
    eq(x.depth, y.depth, `hole${i}.depth`, 1e-6);
    eq(x.dip, y.dip, `hole${i}.dip`, 1e-4);
    eq(x.bearing, y.bearing, `hole${i}.bearing`, 1e-4);
    eq(x.fLink, y.fLink, `hole${i}.fLink`);
  }
  for (let i = 0; i < Math.min(a.links.length, c.links.length); i++) {
    eq(a.links[i].hole1, c.links[i].hole1, `link${i}.hole1`);
    eq(a.links[i].type, c.links[i].type, `link${i}.type`);
  }
  for (let i = 0; i < Math.min(a.detonators.length, c.detonators.length); i++) {
    eq(a.detonators[i].description, c.detonators[i].description, `det${i}.desc`);
    eq(a.detonators[i].series, c.detonators[i].series, `det${i}.series`);
  }
  if (issues.length) { bad++; console.log(`${f}: FAIL`); issues.slice(0,5).forEach(i=>console.log('    '+i)); }
  else console.log(`${f}: round-trips (${a.holes.length} holes, ${a.links.length} ties)`);
}
console.log(bad ? `\n${bad} file(s) failed` : '\nall files round-trip');
process.exit(bad ? 1 : 0);
