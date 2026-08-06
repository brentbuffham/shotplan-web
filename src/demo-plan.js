/**
 * A synthetic .XEL plan, generated rather than shipped.
 *
 * The real sample plans embed a third party's product database, so they stay
 * in the private archive. This produces a structurally valid file with
 * invented product names so the renderer has something to draw on first load.
 */

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
const sci = (v) => {
  // SHOTPlan writes 7 significant figures in Pascal's E notation.
  const s = v.toExponential(7).toUpperCase();
  const [m, e] = s.split('E');
  const sign = e[0] === '-' ? '-' : '+';
  const exp = Math.abs(Number.parseInt(e, 10)).toString().padStart(2, '0');
  return `${v < 0 ? '' : ' '}${m}E${sign}${exp}`;
};

export function demoPlan({ rows = 6, perRow = 8, burden = 3.0, spacing = 3.5 } = {}) {
  const L = [];
  L.push(pad('DEMO PATTERN', 32));
  L.push('005   4.50 1001 1000 585332549 3 12 20 8 100  100 1050 64');
  L.push(`   ${burden.toFixed(2).padStart(5)}    ${spacing.toFixed(2).padStart(5)}    89.00     6.50   0.0000   0.0000`);
  L.push(`${rows} ${perRow}`);
  L.push('');
  L.push('');
  L.push(' 0.00000E+00  1.00000E+02  0.00000E+00  6.00000E+01');
  L.push('');
  L.push('2 4');
  L.push(`${rows} ${perRow} 2 1     ${spacing.toFixed(2)}     ${burden.toFixed(2)}     ${spacing.toFixed(2)}`);

  // 12 surface + 3 lead-in + 20 in-hole = 35, matching the header counts.
  const det = (name, series, idx) =>
    `${pad(name, 10)}${String(series).padStart(3)} ${idx} ${String(idx + 1).padStart(4)}    1 0 0.0 0.0 0.0 6374`;
  const surface = ['SD 9', 'SD 17', 'SD 25', 'SD 42', 'SD 65', 'SD 100'];
  for (let i = 0; i < 12; i++) {
    L.push(i < surface.length ? det(surface[i], 1, i) : det('Not Def.', -1, 0));
  }
  for (let i = 0; i < 3; i++) L.push(i === 0 ? det('Leadin', 11, 0) : det('Not Def.', -1, 0));
  for (let i = 0; i < 20; i++) {
    L.push(i < 15 ? det(`DH #${i + 1}`, 3, i) : det('Not Def.', -1, 0));
  }

  // Hole records, laid out as a staggered pattern.
  const holes = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < perRow; k++) {
      const e = 20 + k * spacing + (r % 2 ? spacing / 2 : 0);
      const n = 15 + r * burden;
      holes.push({ e, n, delay: (k % 8) + 1 });
    }
  }
  const n = holes.length;
  const links = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k + 1 < perRow; k++) {
      links.push([r * perRow + k + 1, r * perRow + k + 2]);
    }
    if (r + 1 < rows) links.push([r * perRow + 1, (r + 1) * perRow + 1]);
  }

  L.push('1 0 0 ');
  L.push(`${n} 0 ${links.length} 0 ${n}`);
  holes.forEach((h, i) => {
    const f = i + 2 <= n ? i + 2 : 0;
    const b = i;
    L.push(
      `${sci(h.e)} ${sci(h.n)}  1.0000000E+20 2 1 ${f} ${b}   89.00     6.50   0.0000  -3.1416   ${h.delay}   0`
    );
  });
  for (const [a, b] of links) L.push(`${a} ${b} 0 0 2     ${spacing.toFixed(2)}`);

  L.push('0'); // benches
  L.push('0'); // boundary
  L.push('0'); // decking
  L.push('0'); // text strings
  return L.join('\r\n') + '\r\n';
}
