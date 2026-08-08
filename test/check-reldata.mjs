/**
 * RELDATA.BIN decode check.
 *
 * Ground truth is the loader in SHOTPLAN.OVR, not a guess at the file:
 *   Reset(f, $1A)            -> 26-byte records
 *   decode(buf, $1A, $457)   -> same routine and seed as DELAYS.BIN
 *   [buf+2], [buf+20]        -> the only two fields ever read
 *
 * The shipped database should come out as 163 records holding round numbers —
 * 100, 1000, 1, 0 — with both fields equal in every record. Anything else, and
 * either the keystream or the record size is wrong.
 *
 * Needs samples/PRODUCTS.BIN and samples/RELDATA.BIN, which are a third
 * party's data and stay untracked.
 */
import { readFileSync, existsSync } from 'node:fs';
import { recoverKey, keyLooksValid } from '../src/format/delays.js';
import { parseRelData, readReliability, REL_RECORD, REL_TYPE_A, REL_TYPE_B }
  from '../src/format/reldata.js';

const S = 'samples/';
if (!existsSync(S + 'RELDATA.BIN')) {
  console.log('samples/RELDATA.BIN not present - skipping');
  process.exit(0);
}

const key = recoverKey(new Uint8Array(readFileSync(S + 'PRODUCTS.BIN')));
const rel = new Uint8Array(readFileSync(S + 'RELDATA.BIN'));

let bad = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${got}${ok ? '' : ` (expected ${want})`}`);
};

console.log('=== RELDATA.BIN ===');
check('keystream is a permutation', keyLooksValid(key), true);
check('file divides into whole records', rel.length % REL_RECORD, 0);

const { records } = parseRelData(rel, key);
check('record count', records.length, 163);

// Every record but the first should decode to a round, non-negative figure.
const round = new Set([0, 1, 100, 1000]);
const odd = records.slice(1).filter((r) => !round.has(r.typeA));
check('records with unexpected values (excluding record 0)', odd.length, 0);

const mismatched = records.slice(1).filter((r) => r.typeA !== r.typeB);
check('records where the two fields disagree', mismatched.length, 0);

const hist = new Map();
for (const r of records.slice(1)) hist.set(r.typeA, (hist.get(r.typeA) || 0) + 1);
console.log('  distribution:', [...hist].sort((a, b) => b[1] - a[1])
  .map(([v, n]) => `${v} x${n}`).join(', '));

// The dispatch must mirror the original's branch, fallbacks included.
console.log('  dispatch:');
check('    type 3 selects field at offset 2', readReliability(rel, key, 3, REL_TYPE_A), 100);
check('    type 6 selects field at offset 20', readReliability(rel, key, 3, REL_TYPE_B), 100);
check('    unknown type falls back to 0', readReliability(rel, key, 3, 9), 0);
check('    missing file falls back to 0', readReliability(null, key, 3, REL_TYPE_A), 0);
check('    out-of-range record falls back to 0', readReliability(rel, key, 9999, REL_TYPE_A), 0);

console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);
