/**
 * Timing contours and first-movement direction.
 *
 * Both read the same scalar field: firing time sampled at each collar,
 * interpolated linearly across the Delaunay triangulation. That is why the
 * original allocates one triangle table and its contour errors mention
 * DELAUNAY directly (`Argh! Not enough free memory for data tables to calc.
 * contours.`, `Too many data points to form DELAUNAY`).
 *
 * The field is the MEAN firing time, not the nominal — v3.0 captions the plot
 * "Contours of mean hole firing times are shown in steps of <n> ms". Nominal
 * and mean differ by a couple of milliseconds per device and the difference
 * accumulates along a path, so this is not a distinction without a difference.
 */
import { triangulate } from './delaunay.js';
import { liveHoles } from '../format/xel.js';

/**
 * Build the interpolable field: live holes with a time value, plus the
 * triangulation over them.
 */
export function timeField(plan, times) {
  const holes = liveHoles(plan).filter(
    (h) => h.e !== null && h.n !== null && times.fire.has(h.index + 1)
  );
  const pts = holes.map((h) => ({ x: h.e, y: h.n }));
  const vals = holes.map((h) => times.fire.get(h.index + 1));
  const { triangles } = triangulate(pts);
  return { holes, pts, vals, triangles };
}

/**
 * Choose a round contour interval giving a readable number of lines.
 * v3.0 used 50 ms on a 308 ms blast — about six contours.
 */
export function chooseStep(span, target = 6) {
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const ideal = span / target;
  // Nearest, not next-larger. Rounding up turned a 312 ms span into a 100 ms
  // step and three contours, where v3.0 drew six at 50 ms.
  return nice.reduce((a, b) => (Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a));
}

/**
 * Marching triangles: contour segments at one level.
 *
 * A triangle is the easy case — linear interpolation is exact inside it and a
 * level crosses either zero or exactly two of its edges, so there is no
 * saddle-point ambiguity to resolve. That is the reason to triangulate rather
 * than grid the data.
 */
function segmentsAt(field, level) {
  const { pts, vals, triangles } = field;
  const out = [];
  for (const [a, b, c] of triangles) {
    const hit = [];
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      const vi = vals[i], vj = vals[j];
      if ((vi < level && vj < level) || (vi > level && vj > level)) continue;
      if (vi === vj) continue;                    // level lies along the edge
      const t = (level - vi) / (vj - vi);
      if (t < 0 || t > 1) continue;
      hit.push({
        x: pts[i].x + t * (pts[j].x - pts[i].x),
        y: pts[i].y + t * (pts[j].y - pts[i].y),
      });
    }
    if (hit.length === 2) out.push([hit[0], hit[1]]);
  }
  return out;
}

/** Join segments end-to-end into polylines so labels can sit at their ends. */
function chain(segments, tol = 1e-6) {
  const remaining = segments.slice();
  const lines = [];
  const near = (p, q) => Math.abs(p.x - q.x) < tol && Math.abs(p.y - q.y) < tol;
  while (remaining.length) {
    const line = remaining.pop();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const [s0, s1] = remaining[i];
        const head = line[0];
        const tail = line[line.length - 1];
        if (near(tail, s0)) { line.push(s1); }
        else if (near(tail, s1)) { line.push(s0); }
        else if (near(head, s0)) { line.unshift(s1); }
        else if (near(head, s1)) { line.unshift(s0); }
        else continue;
        remaining.splice(i, 1);
        grew = true;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Contour the field.
 *
 * @returns {{step: number, levels: Array<{level: number, lines: object[][]}>}}
 */
export function contours(field, step) {
  const finite = field.vals.filter(Number.isFinite);
  if (finite.length < 3) return { step: step ?? 50, levels: [] };
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const s = step ?? chooseStep(hi - lo);
  const levels = [];
  for (let L = Math.ceil(lo / s) * s; L <= hi; L += s) {
    const lines = chain(segmentsAt(field, L)).filter((l) => l.length > 1);
    if (lines.length) levels.push({ level: L, lines });
  }
  return { step: s, levels };
}

/**
 * First movement direction at each hole.
 *
 * Rock breaks toward relief — toward ground that has already fired and moved.
 * So movement follows the DESCENDING time gradient, -grad(T), which is also
 * what v3.0's capture shows: contours rising to the north-east and every arrow
 * pointing south-west.
 *
 * The gradient is estimated per hole from its triangulation neighbours by
 * least squares on the plane through them, which is stable on the irregular
 * point sets real patterns produce.
 */
export function firstMovement(field) {
  const { pts, vals, triangles } = field;
  const nbr = pts.map(() => new Set());
  for (const [a, b, c] of triangles) {
    nbr[a].add(b); nbr[a].add(c);
    nbr[b].add(a); nbr[b].add(c);
    nbr[c].add(a); nbr[c].add(b);
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    // Fit dT ~ gx*dx + gy*dy over the neighbours (normal equations).
    let sxx = 0, sxy = 0, syy = 0, sxv = 0, syv = 0;
    for (const j of nbr[i]) {
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      const dv = vals[j] - vals[i];
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
      sxv += dx * dv; syv += dy * dv;
    }
    const det = sxx * syy - sxy * sxy;
    if (Math.abs(det) < 1e-9) { out.push(null); continue; }
    const gx = (sxv * syy - syv * sxy) / det;
    const gy = (syv * sxx - sxv * sxy) / det;
    const mag = Math.hypot(gx, gy);
    // Movement is DOWN-gradient: negate.
    out.push(mag < 1e-9 ? null : { x: -gx / mag, y: -gy / mag, gradient: mag });
  }
  return out;
}
