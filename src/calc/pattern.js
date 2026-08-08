/**
 * Drill pattern generation — Edit > Add > Pattern.
 *
 * The parameters are not invented: the overlay carries the whole data entry
 * screen verbatim, which is what a pattern consists of.
 *
 *     Pattern and Hole Data Entry Menu
 *     Pattern type        :| SQUARE  |STAGGERED
 *     Number rows         :
 *     Number holes/row    :
 *     Burden  (m)         :
 *     Spacing          (m):
 *     Diameter        (mm):
 *     Vertical angle (dgr):
 *     Depth            (m):
 *     In-hole delay       :
 *     Rubber band mode    :| ON|OFF
 *
 * ## The geometry, measured rather than assumed
 *
 * Reproduced from real plans instead of guessed from the field names:
 *
 *              along row   perpendicular   row-2 shift along row
 *   DHDETC      3.599         2.794              1.800
 *   COMPARE     5.994         6.000              3.000
 *
 * against stored burden 2.8 / 6.0 and spacing 3.6 / 6.0. So **spacing** is
 * along the row, **burden** is between rows measured perpendicular, and a
 * STAGGERED pattern shifts alternate rows by exactly half a spacing. A SQUARE
 * pattern does not shift.
 *
 * ## Which hole belongs to which pattern
 *
 * A hole's `kind` is its **pattern id plus one**; `kind === 1` means the hole
 * came from no pattern at all. Verified across all nine sample plans:
 * COMPARE holds four pattern records, its holes 1-50 carry kind 5 (pattern 4,
 * whose first-hole field is 1) and holes 51-100 carry kind 4 (pattern 3, whose
 * first-hole field is 51). BORPURG's pattern 3 starts at hole 253, and
 * hole 253 carries kind 4. `max(kind)` equals the table's next-free index in
 * every file.
 */

/** Pattern type codes, from the `| SQUARE  |STAGGERED` selector. */
export const SQUARE = 1;
export const STAGGERED = 2;

/** Prompts for the three-step placement, verbatim from SHOTPLAN.OVR. */
export const PATTERN_PROMPT_ORIGIN =
  'Move cursor to position of the leading hole then press Left/Ins button.';
export const PATTERN_PROMPT_DIRECTION =
  'Indicate direction of the first row then Left/Ins or Right/Del to abort.';
export const PATTERN_PROMPT_SIZE =
  'Use cursor to expand or contract pattern. Left/Ins accept or right/Del abort.';
export const PATTERN_TABLE_FULL =
  'The pattern data table is full and no more patterns can be added.';
export const PATTERN_OUTSIDE =
  'The selected position is the outside plan and cannot be used.';

/** Defaults for the entry screen, in its own field order. */
export const PATTERN_DEFAULTS = {
  type: STAGGERED,
  nRows: 5,
  nInRow: 10,
  burden: 3,
  spacing: 3.5,
  diameter: 89,
  angle: 0,
  depth: 6,
  delay: 1,
  rubberBand: true,
};

/**
 * Hole positions for a pattern.
 *
 * @param {object} p        pattern parameters (see PATTERN_DEFAULTS)
 * @param {{e:number,n:number}} origin   the leading hole
 * @param {number} bearing  direction of the first row, degrees from north,
 *                          as picked by "Indicate direction of the first row"
 * @param {number} side     +1 or -1: which side of the first row the pattern
 *                          grows towards
 * @returns {{e:number,n:number,row:number,col:number}[]} in row-major order,
 *          which is the order the original writes them — a pattern occupies a
 *          contiguous run of hole records starting at its first-hole field.
 */
export function patternPositions(p, origin, bearing, side = 1) {
  const rows = Math.max(0, Math.trunc(p.nRows ?? 0));
  const perRow = Math.max(0, Math.trunc(p.nInRow ?? 0));
  const rad = (bearing * Math.PI) / 180;
  // Bearing is from north, clockwise: east = sin, north = cos.
  const along = { e: Math.sin(rad), n: Math.cos(rad) };
  // Perpendicular, rotated by +90 degrees and flipped by `side`.
  const across = { e: along.n * side, n: -along.e * side };

  const out = [];
  for (let r = 0; r < rows; r++) {
    // Only STAGGERED shifts, and by exactly half a spacing.
    const shift = (p.type === STAGGERED && r % 2 === 1) ? p.spacing / 2 : 0;
    for (let c = 0; c < perRow; c++) {
      const d = c * p.spacing + shift;
      const b = r * p.burden;
      out.push({
        e: origin.e + along.e * d + across.e * b,
        n: origin.n + along.n * d + across.n * b,
        row: r,
        col: c,
      });
    }
  }
  return out;
}

/**
 * Bearing from one point to another, degrees from north. This is what the
 * "Indicate direction of the first row" click resolves to.
 */
export function bearingBetween(from, to) {
  return ((Math.atan2(to.e - from.e, to.n - from.n) * 180) / Math.PI + 360) % 360;
}

/**
 * Scale factor for the expand/contract step.
 *
 * "Use cursor to expand or contract pattern" adjusts the pattern's extent
 * while the origin and bearing stay put, so the natural reading is that the
 * cursor sets how far the first row reaches: dragging to twice the distance
 * doubles burden and spacing together.
 *
 * The original also shows a live `Spacing <n>m  <a> dgr` readout during this
 * step, which is why both numbers are returned rather than just a factor.
 */
export function sizeFromCursor(p, origin, cursor) {
  const reach = Math.hypot(cursor.e - origin.e, cursor.n - origin.n);
  const nominal = Math.max(1, (p.nInRow ?? 1) - 1) * p.spacing;
  const factor = nominal > 1e-9 ? reach / nominal : 1;
  return {
    factor,
    spacing: p.spacing * factor,
    burden: p.burden * factor,
  };
}

/**
 * Add a pattern's holes to a plan.
 *
 * Every hole gets `kind = patternId + 1`, which is how the file records
 * membership, and the pattern's own record stores the first hole so the run
 * can be found again. Holes are appended in row-major order; reusing free
 * records would scatter the run and break that, so a pattern always extends
 * the table.
 *
 * @returns {{ok:boolean, patternId?:number, first?:number, count?:number, reason?:string}}
 */
export function addPattern(plan, p, origin, bearing, side = 1) {
  const table = plan.patternTable;
  if (!table) return { ok: false, reason: PATTERN_TABLE_FULL };
  const positions = patternPositions(p, origin, bearing, side);
  if (!positions.length) return { ok: false, reason: PATTERN_TABLE_FULL };

  const patternId = table.freeIndex;          // 1-based; also the next free slot
  const first = plan.holes.length + 1;        // 1-based hole record number

  for (const pos of positions) {
    plan.holes.push({
      index: plan.holes.length,
      e: pos.e, n: pos.n, rl: 0,
      kind: patternId + 1,                    // pattern id + 1; see the note above
      flag: 0, fLink: 0, bLink: 0,
      angle: p.angle ?? 0,
      depth: p.depth ?? 0,
      dip: 0, bearing: 0,
      delay: p.delay ?? 1,
      unknown12: 0,
      live: true, dummy: false, deleted: false,
      freeLink: null, deletedGroup: null,
    });
  }

  table.patterns.push({
    nRows: p.nRows,
    nInRow: p.nInRow,
    type: p.type,
    firstHole: first,
    // Field 5 is unidentified — see xel.js. DHDETC, the one pattern that can
    // be reproduced exactly, stores the along-row spacing here, so that is
    // what is written. COMPARE and BORPURG store something larger, so a
    // pattern written here may differ from one v3.0 wrote in this field alone.
    field5: p.spacing,
    burden: p.burden,
    spacing: p.spacing,
  });
  table.freeIndex = patternId + 1;

  plan.tables.nHoleRecords = plan.holes.length;
  plan.tables.nBlastHoles = (plan.tables.nBlastHoles | 0) + positions.length;
  return { ok: true, patternId, first, count: positions.length };
}
