/**
 * SHOTPlan device reliability database (`RELDATA.BIN`).
 *
 * The last of the three binary databases, and the one the Misfires calculation
 * rests on. It is optional: the original runs happily without it and stores
 * zero for every reliability figure, showing
 * "Device reliability datafile RelData.bin not present".
 *
 * ## Layout
 *
 * 26-byte records, no header of its own. Same obfuscation as `DELAYS.BIN` --
 * literally the same decode routine called with the same seed, only the record
 * length differs -- so the keystream offset is unchanged at 171.
 *
 *     offset  size  field
 *        0      2   filler, not read
 *        2      6   real48   reliability, product type 3
 *        8     12   filler, not read
 *       20      6   real48   reliability, product type 6
 *
 * ## The filler really is filler
 *
 * Bytes 0-1 and 8-19 alternate between two fixed blobs across every record in
 * the shipped database. That is uninitialised memory the writer flushed to
 * disk, not data: the real48 fields either side of it decode correctly in both
 * parities, so the keystream is right the whole way through the record. Three
 * attempts to infer this layout from byte statistics alone all foundered on
 * trying to make those twelve bytes mean something.
 *
 * ## Addressing
 *
 * Records are NOT found by position. Each product carries its own record
 * number at offset 155 of its 157-byte `PRODUCTS.BIN` record, and the loader
 * seeks to it. `readReliability` therefore takes an explicit record index.
 */

import { DELAY_KEY_OFFSET, real48 } from './delays.js';

/** Record size, bytes. `Reset(f, $1A)` in the original. */
export const REL_RECORD = 26;

/**
 * Product type codes that select which of the two fields applies. The original
 * compares the product's type word against these two literals and takes the
 * matching field; anything else leaves the reliability at zero.
 */
export const REL_TYPE_A = 3;
export const REL_TYPE_B = 6;

/** Byte offsets of the two real48 fields, the only bytes ever read. */
const FIELD_A = 2;
const FIELD_B = 20;

/**
 * Decode one record.
 *
 * @param {Uint8Array} bytes  raw RELDATA.BIN
 * @param {Uint8Array} key    keystream from recoverKey(PRODUCTS.BIN)
 * @param {number} index      0-based record number, from the product entry
 * @returns {Uint8Array|null} the 26 plaintext bytes, or null if out of range
 */
export function decodeRecord(bytes, key, index) {
  const base = index * REL_RECORD;
  if (index < 0 || base + REL_RECORD > bytes.length) return null;
  const out = new Uint8Array(REL_RECORD);
  for (let j = 0; j < REL_RECORD; j++) {
    out[j] = bytes[base + j] ^ key[(DELAY_KEY_OFFSET + j) % 256];
  }
  return out;
}

/**
 * The reliability figure for a product.
 *
 * Mirrors the original's branch exactly, including the fallback: a missing
 * file, an out-of-range record or an unrecognised product type all yield 0,
 * which is what the original stores.
 *
 * @param {Uint8Array} bytes     raw RELDATA.BIN, or null if absent
 * @param {Uint8Array} key       keystream from recoverKey(PRODUCTS.BIN)
 * @param {number} index         0-based record number (PRODUCTS.BIN offset 155)
 * @param {number} productType   product type word (PRODUCTS.BIN offset 27)
 */
export function readReliability(bytes, key, index, productType) {
  if (!bytes) return 0;
  const r = decodeRecord(bytes, key, index);
  if (!r) return 0;
  if (productType === REL_TYPE_A) return real48(r, FIELD_A);
  if (productType === REL_TYPE_B) return real48(r, FIELD_B);
  return 0;
}

/**
 * Decode the whole file, for inspection rather than for the calculation.
 *
 * Both fields are reported because the shipped database holds the same value
 * in each, so there is no way to tell them apart from data alone — only the
 * type-3 / type-6 branch in the original distinguishes them.
 */
export function parseRelData(bytes, key) {
  const n = Math.floor(bytes.length / REL_RECORD);
  const records = [];
  for (let i = 0; i < n; i++) {
    const r = decodeRecord(bytes, key, i);
    records.push({ record: i, typeA: real48(r, FIELD_A), typeB: real48(r, FIELD_B) });
  }
  return { records };
}
