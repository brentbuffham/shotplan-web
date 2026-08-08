/**
 * `.XEL` writer.
 *
 * Round-trips a plan parsed by `parseXel`. The rule throughout is to preserve
 * anything not understood rather than normalise it: unidentified header fields,
 * the detonator table's trailing columns and the raw decking lines are all
 * written back as they were read. A writer that "tidies" fields it does not
 * understand is a writer that silently corrupts plans.
 *
 * Numeric formatting matters. SHOTPlan writes reals in Turbo Pascal's `E`
 * notation at 7 significant figures, and its own reader is tolerant of
 * whitespace but the format is what v3.0 produces. Matching it keeps a
 * rewritten file diffable against the original, which is how the writer is
 * tested.
 */

/** Pascal-style scientific notation: ` 6.0674342E+01`, `-3.6109000E+00`. */
export function sci(v) {
  if (v === null || v === undefined) v = 1.0e20;   // the undefined sentinel
  const s = Math.abs(v).toExponential(7).toUpperCase();
  const [m, e] = s.split('E');
  const sign = Number.parseInt(e, 10) < 0 ? '-' : '+';
  const exp = String(Math.abs(Number.parseInt(e, 10))).padStart(2, '0');
  return `${v < 0 ? '-' : ' '}${m}E${sign}${exp}`;
}

const f2 = (v) => Number(v ?? 0).toFixed(2);
const f4 = (v) => Number(v ?? 0).toFixed(4);

/**
 * Serialise a plan back to `.XEL` text.
 *
 * @param {object} plan  as returned by parseXel
 * @returns {string} CRLF-terminated file contents
 */
export function writeXel(plan) {
  const L = [];
  const h = plan.header;

  L.push((plan.title ?? '').padEnd(32).slice(0, 32));
  L.push([
    h.version,
    ` ${f2(h.unknown1).padStart(5)}`,
    h.unknown2, h.unknown3, h.stamp,
    h.nLeadIn, h.nSurface, h.nInHole, h.nDelayNumbers,
    ...h.rest.map((v) => (Number.isInteger(v) ? v : f2(v))),
  ].join(' '));

  const d = plan.defaults;
  L.push([d.burden, d.spacing, d.angle, d.depth]
    .map((v) => f2(v).padStart(9)).join('')
    + d.unknown.map((v) => f4(v).padStart(9)).join(''));

  L.push(plan.grid.join(' '));
  L.push('');
  L.push('');
  const e = plan.extents;
  L.push([e.minE, e.maxE, e.minN, e.maxN].map((v) => sci5(v)).join(' '));
  L.push('');

  const pt = plan.patternTable;
  L.push(`${pt.freeIndex} ${pt.selected}`);
  for (const p of pt.patterns) {
    // Column order is field5, burden, spacing — see the note in xel.js. It is
    // NOT spacing-first, which is what the names used to imply.
    L.push(`${p.nRows} ${p.nInRow} ${p.type} ${p.firstHole}`
      + `${f2(p.field5).padStart(9)}${f2(p.burden).padStart(9)}${f2(p.spacing).padStart(9)}`);
  }

  // Detonators: description occupies a fixed 10 characters, then the numeric
  // columns exactly as they were read.
  for (const det of plan.detonators) {
    L.push(det.description.padEnd(10) + det.fields
      .map((v, i) => (i < 2 ? String(v) : formatDetField(v))).join(' '));
  }

  const t = plan.tables;
  L.push(t.unknownTriple.join(' ') + ' ');
  L.push([t.nHoleRecords, t.holeFreePtr, t.nLinks, t.unknown, t.nBlastHoles].join(' '));

  for (const hole of plan.holes) {
    // The three coordinates are joined with an explicit space. Relying on
    // sci()'s leading space to separate them works only while every value is
    // positive: a negative northing starts with '-' and runs straight into the
    // previous field, producing one unsplittable token. v3.0 sidesteps this by
    // writing fixed-width columns, which always leave a space before a minus.
    L.push([
      [sci(hole.e), sci(hole.n), sci(hole.rl)].join(' '),
      ` ${hole.kind} ${hole.flag} ${hole.fLink} ${hole.bLink}`,
      f2(hole.angle).padStart(8),
      f2(hole.depth).padStart(9),
      f4(hole.dip).padStart(9),
      f4(hole.bearing).padStart(9),
      String(hole.delay).padStart(4),
      String(hole.unknown12).padStart(4),
    ].join(''));
  }

  for (const l of plan.links) {
    L.push(`${l.hole1} ${l.hole2} ${l.fLink} ${l.bLink} ${l.type}${f2(l.dist).padStart(9)}`);
  }

  L.push(String(plan.benches.length));
  for (const b of plan.benches) {
    for (const pts of [b.crest, b.foot]) {
      L.push(String(pts.length));
      for (const p of pts) L.push([sci(p.e), sci(p.n), sci(p.rl)].join(' '));
    }
  }

  L.push(String(plan.boundary.length));
  for (const p of plan.boundary) L.push([sci(p.e), sci(p.n), sci(p.rl)].join(' '));

  // Decking was never sampled non-empty, so lines are echoed verbatim rather
  // than reconstructed from a guessed layout.
  L.push(String(plan.decking.length));
  for (const dk of plan.decking) L.push(dk.raw);

  L.push(String(plan.texts.length));
  for (const tx of plan.texts) L.push(`${sci(tx.e)} ${sci(tx.n)} ${tx.text}`);

  return L.join('\r\n') + '\r\n';
}

/** The extents line uses 5 significant figures, not 7. */
function sci5(v) {
  const s = Math.abs(v ?? 0).toExponential(5).toUpperCase();
  const [m, e] = s.split('E');
  const sign = Number.parseInt(e, 10) < 0 ? '-' : '+';
  const exp = String(Math.abs(Number.parseInt(e, 10))).padStart(2, '0');
  return `${(v ?? 0) < 0 ? '-' : ' '}${m}E${sign}${exp}`;
}

/** Detonator numeric columns: integers stay integers, reals keep one decimal. */
function formatDetField(v) {
  return Number.isInteger(v) ? String(v) : String(v);
}
