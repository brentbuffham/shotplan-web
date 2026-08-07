/**
 * SHOTPlan detonator delay database (`DELAYS.BIN`).
 *
 * This is the file the Calculations menu rests on. Each detonator carries a
 * nominal delay *and* a measured mean and standard deviation, which is what
 * lets SHOTPlan report firing-order probabilities instead of just adding
 * numbers up.
 *
 * The file is XOR-obfuscated against a 256-byte keystream that is a complete
 * permutation of 0-255. The key is NOT embedded here: it is recovered at
 * runtime from the user's own `PRODUCTS.BIN` by byte-frequency analysis. That
 * keeps a third party's product database — and the key to it — out of this
 * repository, while still letting anyone who owns the program read their own
 * files.
 *
 * Applying the keystream continuously does not work. It is applied *per
 * record* from a fixed offset, which is why every repeat stride in the file is
 * a multiple of the 39-byte record size.
 */

/** Record size, bytes. */
export const DELAY_RECORD = 39;

/** Key offset the delay records are XORed from. See docs in the archive. */
export const DELAY_KEY_OFFSET = 171;

/**
 * Recover the 256-byte keystream from any obfuscated file whose plaintext is
 * mostly null padding — `PRODUCTS.BIN` is the reliable one.
 *
 * The padding byte is NULL, not space. Assuming space yields text with every
 * letter's case inverted, which is the 0x20 tell.
 */
export function recoverKey(bytes) {
  const key = new Uint8Array(256);
  for (let j = 0; j < 256; j++) {
    const counts = new Uint32Array(256);
    for (let i = j; i < bytes.length; i += 256) counts[bytes[i]]++;
    let best = 0;
    for (let v = 1; v < 256; v++) if (counts[v] > counts[best]) best = v;
    key[j] = best;
  }
  return key;
}

/** Is this a plausible keystream? A correct one is a permutation of 0..255. */
export function keyLooksValid(key) {
  const seen = new Uint8Array(256);
  for (const b of key) seen[b] = 1;
  return seen.every((v) => v === 1);
}

/**
 * Turbo Pascal 6-byte real.
 *
 * `[exponent][mantissa x5]`, exponent biased by 129, sign in the high bit of
 * the last byte, implicit leading 1. A zero exponent means zero.
 */
export function real48(b, off = 0) {
  const e = b[off];
  if (e === 0) return 0;
  const sign = (b[off + 5] & 0x80) ? -1 : 1;
  // Mantissa is 39 bits; assemble in floating point to avoid 32-bit coercion.
  const mant =
    (b[off + 5] & 0x7f) * 4294967296 +
    b[off + 4] * 16777216 +
    b[off + 3] * 65536 +
    b[off + 2] * 256 +
    b[off + 1];
  return sign * (1 + mant / 549755813888) * Math.pow(2, e - 129);
}

/**
 * Decode `DELAYS.BIN`.
 *
 * @param {Uint8Array} bytes    raw DELAYS.BIN
 * @param {Uint8Array} key      keystream from recoverKey(PRODUCTS.BIN)
 * @returns {{title: string, detonators: object[]}}
 */
export function parseDelays(bytes, key) {
  const n = Math.floor(bytes.length / DELAY_RECORD);
  const rec = (i) => {
    const out = new Uint8Array(DELAY_RECORD);
    const base = i * DELAY_RECORD;
    for (let j = 0; j < DELAY_RECORD; j++) {
      out[j] = bytes[base + j] ^ key[(DELAY_KEY_OFFSET + j) % 256];
    }
    return out;
  };
  const str = (r) => {
    let s = '';
    for (let i = 1; i <= r[0] && i < r.length; i++) s += String.fromCharCode(r[i]);
    return s.replace(/\s+$/, '');
  };

  const head = rec(0);
  const detonators = [];
  for (let i = 1; i < n; i++) {
    const r = rec(i);
    const dv = new DataView(r.buffer, r.byteOffset, r.byteLength);
    detonators.push({
      record: i,
      name: str(r),
      index: r[9],
      // Two uint16 fields, NOT one uint32. Reading them as a 32-bit value
      // makes the dual-delay products (G25/400, G42/400) come out as 26 million.
      nominal: dv.getUint16(11, true),
      nominal2: dv.getUint16(13, true),
      mean: real48(r, 15),
      sd: real48(r, 21),
    });
  }
  return { title: str(head), detonators };
}

/** Index by name for lookup from a plan's detonator table. */
export function byName(db) {
  const m = new Map();
  for (const d of db.detonators) if (d.name) m.set(d.name, d);
  return m;
}

/**
 * Sample a firing delay for one detonator.
 *
 * Uses the measured mean and standard deviation, not the nominal — that
 * distinction is the entire reason this table carries three numbers per
 * device. `rand` should return a standard normal.
 */
export function sampleDelay(det, rand) {
  if (!det) return 0;
  if (!det.sd) return det.mean || det.nominal;
  return det.mean + det.sd * rand();
}

/** Box-Muller standard normal, from a uniform source. */
export function normalFrom(uniform) {
  let u = 0, v = 0;
  while (u === 0) u = uniform();
  while (v === 0) v = uniform();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
