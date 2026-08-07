import { readFileSync } from 'node:fs';
import { recoverKey, keyLooksValid, parseDelays } from '../src/format/delays.js';
const A = 'C:/Users/brent/Desktop/git/shotplan-archive/';
const key = recoverKey(new Uint8Array(readFileSync(A + 'PRODUCTS.BIN')));
console.log('key is a permutation of 0..255:', keyLooksValid(key));
const db = parseDelays(new Uint8Array(readFileSync(A + 'DELAYS.BIN')), key);
console.log('title:', JSON.stringify(db.title));
console.log('detonators:', db.detonators.length);
const E = {'MS #1':25,'MS #2':50,'MS #3':75,'MS #4':100,'MS #5':125,'MS #6':150,'MS #7':175,'MS #8':200,'MS #9':250,'MS #10':300,'MS #11':350,'MS #12':400,'MS #13':450,'MS #14':500,'MS #15':600};
let ok=0,bad=0;
for (const d of db.detonators) if (E[d.name]!==undefined) (E[d.name]===d.nominal? ok++ : (bad++, console.log('MISMATCH',d.name,d.nominal)));
console.log(`in-hole MS series: ${ok}/15 match`);
console.log('dual-delay:', db.detonators.filter(d=>d.nominal2).map(d=>`${d.name} ${d.nominal}/${d.nominal2}`).join(', '));
for (const n of ['MS #1','MS #3','MS #15','CD  9']) {
  const d = db.detonators.find(x=>x.name===n);
  if (d) console.log(`  ${d.name.padEnd(8)} nom=${String(d.nominal).padStart(4)} mean=${d.mean.toFixed(3).padStart(8)} sd=${d.sd.toFixed(3)}`);
}
