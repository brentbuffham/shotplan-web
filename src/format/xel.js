/**
 * SHOTPlan `.XEL` plan file reader.
 *
 * `.XEL` is plain ASCII, line oriented, CRLF terminated — a direct
 * serialisation of SHOTPlan's in-memory structures, in the same section order
 * its own "Data dump print" report walks.
 *
 * Three things about this format will bite you if you assume otherwise:
 *
 *  1. **Counters are next-free indices, not counts.** The pattern table opens
 *     with `2 4` when it holds *one* pattern, `1 1` when it holds none. This is
 *     a 1-based free-list pointer, the same idiom used for holes and links.
 *     Subtract one.
 *
 *  2. **The surface-link table has no header.** Its length lives in field 3 of
 *     the hole header line, and the records simply follow the hole records.
 *
 *  3. **Numeric columns are Pascal `write(x:width)` fields, not
 *     whitespace-delimited.** Detonator descriptions occupy a fixed 10
 *     characters and routinely contain digits and spaces ("MS #1",
 *     "U/G ENDURADet 11-30"), so splitting on whitespace mis-parses them.
 *     Everything *after* the description can be split on whitespace safely,
 *     because inter-file padding varies — DEFAULTS.XEL pads far wider than a
 *     plan saved from the editor.
 *
 * Also worth knowing: `1.0000000E+20` is the *undefined* sentinel (used for
 * RL), and coordinates are written at 7 significant figures, so a read/rewrite
 * cycle quantises position.
 */

/** Sentinel SHOTPlan writes for an undefined real. */
export const UNDEF = 1.0e20;

/** Width of the detonator description field, in characters. */
const DESC_WIDTH = 10;

const isUndef = (v) => v >= 9.9e19;

/** Parse a SHOTPlan real, mapping the undefined sentinel to null. */
function real(tok) {
  const v = Number.parseFloat(tok);
  if (!Number.isFinite(v)) return null;
  return isUndef(v) ? null : v;
}

function num(tok) {
  const v = Number.parseFloat(tok);
  return Number.isFinite(v) ? v : 0;
}

function int(tok) {
  const v = Number.parseInt(tok, 10);
  return Number.isNaN(v) ? 0 : v;
}

/** Split on whitespace runs, dropping empties. */
function fields(line) {
  return line.trim().split(/\s+/).filter((s) => s.length > 0);
}

/** Forward cursor over lines. The format is strictly sequential. */
class Cursor {
  constructor(text) {
    this.lines = text
      .replace(/\r\n/g, '\n')
      .replace(/\x1a[\s\S]*$/, '') // DOS EOF marker, if present
      .split('\n');
    this.i = 0;
  }
  next() {
    if (this.i >= this.lines.length) {
      throw new Error(`XEL: unexpected end of file (line ${this.i + 1})`);
    }
    return this.lines[this.i++];
  }
  /** Next line with content, skipping the format's blank separators. */
  nextNonBlank() {
    for (;;) {
      const l = this.next();
      if (l.trim().length > 0) return l;
    }
  }
  /** 1-based number of the line most recently returned. */
  get at() {
    return this.i;
  }
}

/**
 * Read a `.XEL` file.
 *
 * @param {string} text  raw contents, decoded as latin1 / cp437
 * @returns {object} parsed plan
 */
export function parseXel(text) {
  const c = new Cursor(text);

  // ---- 1: title, 32 chars space padded ------------------------------------
  const title = c.next().replace(/\s+$/, '');

  // ---- 2: version and table sizes -----------------------------------------
  // 005   4.50 1001 1000 585332549 3 12 20 8 100  100 1050 64
  const h = fields(c.next());
  const header = {
    version: h[0],
    unknown1: num(h[1]),
    unknown2: int(h[2]),
    unknown3: int(h[3]),
    stamp: h[4],
    nLeadIn: int(h[5]),
    nSurface: int(h[6]),
    nInHole: int(h[7]),
    nDelayNumbers: int(h[8]),
    rest: h.slice(9).map(num),
  };

  // ---- 3: plan defaults ---------------------------------------------------
  const d = fields(c.next());
  const defaults = {
    burden: num(d[0]),
    spacing: num(d[1]),
    angle: num(d[2]),
    depth: num(d[3]),
    unknown: d.slice(4).map(num),
  };

  // ---- 4: default grid ----------------------------------------------------
  const grid = fields(c.next()).map(int); // e.g. "5 5", "10 5", "8 1"

  // ---- extents (blank separated) ------------------------------------------
  const e = fields(c.nextNonBlank()).map(num);
  const extents = { minE: e[0], maxE: e[1], minN: e[2], maxN: e[3] };

  // ---- pattern table ------------------------------------------------------
  // Opens with a next-free index, NOT a count: "1 1" = none, "2 4" = one.
  const pf = fields(c.nextNonBlank()).map(int);
  const nPatterns = Math.max(0, pf[0] - 1);
  const patterns = [];
  for (let k = 0; k < nPatterns; k++) {
    const p = fields(c.next());
    patterns.push({
      nRows: int(p[0]),
      nInRow: int(p[1]),
      type: int(p[2]),
      unknown: int(p[3]),
      spacing: num(p[4]),
      burden: num(p[5]),
      minDist: num(p[6]),
    });
  }
  const patternTable = { freeIndex: pf[0], selected: pf[1], patterns };

  // ---- detonator table ----------------------------------------------------
  // Fixed count from line 2, in file order: surface, lead-in, in-hole.
  const nDet = header.nSurface + header.nLeadIn + header.nInHole;
  const detonators = [];
  for (let k = 0; k < nDet; k++) {
    const line = c.next();
    const description = line.slice(0, DESC_WIDTH).replace(/\s+$/, '');
    const f = fields(line.slice(DESC_WIDTH));
    detonators.push({
      description,
      series: int(f[0]), // -1 marks an undefined slot
      index: int(f[1]),
      fields: f.map(num),
      defined: int(f[0]) !== -1,
      kind:
        k < header.nSurface
          ? 'surface'
          : k < header.nSurface + header.nLeadIn
            ? 'lead-in'
            : 'in-hole',
    });
  }

  // ---- table headers ------------------------------------------------------
  // Two lines: a triple whose meaning is not yet established, then the hole
  // header, which also carries the surface-link count.
  const triple = fields(c.next()).map(int); // "1 0 0" / "0 0 0"
  const hh = fields(c.next()).map(int);     // "200 0 235 32 200"
  const tables = {
    unknownTriple: triple,
    nHoleRecords: hh[0],
    holeFreePtr: hh[1],
    nLinks: hh[2],
    unknown: hh[3],
    nBlastHoles: hh[4],
  };

  // ---- hole records -------------------------------------------------------
  //
  // Field 4 is a tri-state, not a type flag. Verified against the declared
  // blast-hole count in all ten sample plans:
  //
  //    > 0   live blast hole. The value varies 1..7 between files and tracks
  //          something per-hole (bench or product index) — not yet pinned down.
  //     0    dummy hole — occupies a record and a position but does not fire.
  //    < 0   deleted. The magnitude is the free-list link, which is why these
  //          appear as -33, -49, -65, -160 rather than a constant marker.
  //
  // Counting `kind > 0` reproduces the header's blast-hole count exactly for
  // every sample; counting `kind !== 0` does not, because dummies are excluded.
  const holes = [];
  for (let k = 0; k < tables.nHoleRecords; k++) {
    const f = fields(c.next());
    const kind = int(f[3]);
    holes.push({
      index: k,
      e: real(f[0]),
      n: real(f[1]),
      rl: real(f[2]), // null when undefined
      kind,
      flag: int(f[4]),
      fLink: int(f[5]), // 0 terminates
      bLink: int(f[6]),
      angle: num(f[7]),
      depth: num(f[8]),
      unknown9: num(f[9]),
      bearing: num(f[10]), // radians
      delay: int(f[11]),   // in-hole delay number
      unknown12: int(f[12]),
      live: kind > 0,
      dummy: kind === 0,
      deleted: kind < 0,
      freeLink: kind < 0 ? -kind : null,
    });
  }

  // ---- surface links (no header; count came from the hole header) ---------
  const links = [];
  for (let k = 0; k < tables.nLinks; k++) {
    const f = fields(c.next());
    links.push({
      index: k,
      hole1: int(f[0]),
      hole2: int(f[1]),
      fLink: int(f[2]),
      bLink: int(f[3]),
      type: int(f[4]),
      dist: num(f[5]),
    });
  }

  // ---- benches ------------------------------------------------------------
  const readPoints = (n) => {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const f = fields(c.next());
      pts.push({ e: real(f[0]), n: real(f[1]), rl: real(f[2]) });
    }
    return pts;
  };
  const benches = [];
  const nBenches = int(fields(c.next())[0]);
  for (let k = 0; k < nBenches; k++) {
    const crest = readPoints(int(fields(c.next())[0]));
    const foot = readPoints(int(fields(c.next())[0]));
    benches.push({ crest, foot });
  }

  // ---- boundary -----------------------------------------------------------
  const nBoundary = int(fields(c.next())[0]);
  const boundary = [];
  for (let k = 0; k < nBoundary; k++) {
    const f = fields(c.next());
    boundary.push({ e: real(f[0]), n: real(f[1]), rl: real(f[2]) });
  }

  // ---- decking ------------------------------------------------------------
  // No non-empty sample was available when this was written. Lines are kept
  // raw rather than guessed at, so a future sample can be inspected without
  // the parser having silently mangled it.
  const nDeckTypes = int(fields(c.next())[0]);
  const decking = [];
  for (let k = 0; k < nDeckTypes; k++) decking.push({ raw: c.next() });

  // ---- text strings -------------------------------------------------------
  const nText = int(fields(c.next())[0]);
  const texts = [];
  for (let k = 0; k < nText; k++) {
    const line = c.next();
    const f = fields(line);
    const after = line.indexOf(f[1], line.indexOf(f[0]) + f[0].length) + f[1].length;
    texts.push({
      e: real(f[0]),
      n: real(f[1]),
      text: line.slice(after).replace(/^\s/, '').replace(/\s+$/, ''),
    });
  }

  return {
    title,
    header,
    defaults,
    grid,
    extents,
    patternTable,
    detonators,
    tables,
    holes,
    links,
    benches,
    boundary,
    decking,
    texts,
  };
}

/** Live blast holes — excludes dummy holes and deleted records. */
export function liveHoles(plan) {
  return plan.holes.filter((h) => h.live);
}

/** Dummy holes: they occupy a position but do not fire. */
export function dummyHoles(plan) {
  return plan.holes.filter((h) => h.dummy);
}

/**
 * Walk the hole table's own doubly linked list via `fLink`.
 *
 * This is *storage* order, not firing order. The tie-up that determines
 * initiation lives in the surface-link table (`plan.links`), which connects
 * hole to hole through surface detonators; deriving firing times from it
 * requires the delay database and is not implemented here yet.
 *
 * Returns null if the walk does not cover every live hole, rather than
 * returning a partial chain. The original guards against the same condition:
 * "Argh! Plan tie-up too complicated to trace initiation path."
 */
export function holeChain(plan) {
  const live = liveHoles(plan);
  if (!live.length) return [];
  const byIndex = new Map(plan.holes.map((h) => [h.index, h]));
  const seen = new Set();
  const out = [];
  let cur = live.find((h) => h.bLink === 0) ?? live[0];
  while (cur && !seen.has(cur.index)) {
    seen.add(cur.index);
    out.push(cur);
    cur = byIndex.get(cur.fLink);
  }
  return out.length === live.length ? out : null;
}

/** Bounding box over live and dummy holes, for view fitting. */
export function planBounds(plan) {
  const pts = plan.holes.filter((h) => !h.deleted && h.e !== null);
  for (const b of plan.benches) pts.push(...b.crest, ...b.foot);
  pts.push(...plan.boundary);
  if (!pts.length) return null;
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const p of pts) {
    if (p.e === null || p.n === null) continue;
    if (p.e < minE) minE = p.e;
    if (p.e > maxE) maxE = p.e;
    if (p.n < minN) minN = p.n;
    if (p.n > maxN) maxN = p.n;
  }
  return { minE, maxE, minN, maxN };
}
