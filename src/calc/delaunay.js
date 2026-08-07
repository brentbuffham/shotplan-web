/**
 * Delaunay triangulation of hole collars.
 *
 * SHOTPlan uses this to define what "adjacent holes" means. That is not the
 * tie-up: two holes can be neighbours on the bench with no connector between
 * them, and those are exactly the pairs that matter — a hole firing out of
 * sequence relative to its physical neighbour causes poor breakage regardless
 * of how the signal reached either one.
 *
 * The same triangulation feeds the contour calculations, which is why the
 * original allocates one triangle table and its errors mention both
 * (`Too many data points to form DELAUNAY`, `Not enough free memory to create
 * triangle table`, `Argh! Not enough memory to create triangle table.`).
 *
 * Bowyer-Watson. Blast plans run to a few hundred holes, so the O(n^2)
 * behaviour of the straightforward implementation is irrelevant and the
 * clarity is worth more than the asymptotics.
 */

/** Squared distance from a point to a triangle's circumcentre, and the radius. */
function circumcircle(ax, ay, bx, by, cx, cy) {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null; // collinear
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const dx = ax - ux;
  const dy = ay - uy;
  return { x: ux, y: uy, r2: dx * dx + dy * dy };
}

/**
 * Triangulate points `[{x, y, ...}]`.
 *
 * @returns {{triangles: number[][], edges: Array<[number, number]>}}
 *          indices into the input array; edges are unique and undirected
 */
export function triangulate(points) {
  const n = points.length;
  if (n < 3) return { triangles: [], edges: [] };

  // Super-triangle large enough to contain every point. Its vertices are
  // appended to the working list and stripped at the end.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const dmax = Math.max(dx, dy) * 20;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  const s0 = pts.push({ x: midX - dmax, y: midY - dmax }) - 1;
  const s1 = pts.push({ x: midX, y: midY + dmax }) - 1;
  const s2 = pts.push({ x: midX + dmax, y: midY - dmax }) - 1;

  const make = (a, b, c) => {
    const cc = circumcircle(pts[a].x, pts[a].y, pts[b].x, pts[b].y, pts[c].x, pts[c].y);
    return cc ? { a, b, c, cc } : null;
  };

  let tris = [make(s0, s1, s2)].filter(Boolean);

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const bad = [];
    const keep = [];
    for (const t of tris) {
      const ddx = p.x - t.cc.x;
      const ddy = p.y - t.cc.y;
      if (ddx * ddx + ddy * ddy <= t.cc.r2) bad.push(t);
      else keep.push(t);
    }
    // Boundary of the cavity: edges belonging to exactly one bad triangle.
    const count = new Map();
    for (const t of bad) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        const k = u < v ? `${u},${v}` : `${v},${u}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    tris = keep;
    for (const [k, c] of count) {
      if (c !== 1) continue;
      const [u, v] = k.split(',').map(Number);
      const t = make(u, v, i);
      if (t) tris.push(t);
    }
  }

  // Drop anything still touching the super-triangle.
  const triangles = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    triangles.push([t.a, t.b, t.c]);
  }

  const seen = new Set();
  const edges = [];
  for (const [a, b, c] of triangles) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push(u < v ? [u, v] : [v, u]);
    }
  }
  return { triangles, edges };
}

/**
 * Drop edges longer than `maxLen`.
 *
 * A Delaunay triangulation spans the convex hull, so a concave pattern picks up
 * long edges bridging across empty ground. Those pairs are not neighbours in
 * any useful sense and the original clearly does not draw them — its mesh hugs
 * the pattern. Default cut is a multiple of the median edge, which adapts to
 * the pattern's own spacing rather than assuming a burden.
 */
export function pruneLongEdges(points, edges, factor = 2.0) {
  if (!edges.length) return edges;
  const len = ([a, b]) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  const sorted = edges.map(len).sort((p, q) => p - q);
  const median = sorted[Math.floor(sorted.length / 2)];
  const cut = median * factor;
  return edges.filter((e) => len(e) <= cut);
}
