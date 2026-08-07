/**
 * Build a single self-contained HTML file.
 *
 * blastingapps.com is a flat GitHub Pages site — one .html per tool at the
 * root — so this app has to arrive as one file rather than a directory of
 * modules. Vite already bundles the module graph into a single script; all
 * that remains is to inline that script and the stylesheet into the HTML.
 *
 *   node tools/build-page.js [outfile]
 *
 * Run `vite build` first, or use `npm run build:page` which does both.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'shotplan3.html';
const DIST = 'dist';

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

// Inline every emitted script and stylesheet.
const assets = readdirSync(join(DIST, 'assets'));
for (const f of assets) {
  const body = readFileSync(join(DIST, 'assets', f), 'utf8');
  if (f.endsWith('.js')) {
    // A closing tag inside the bundle would terminate the script element.
    const safe = body.replace(/<\/script>/gi, '<\\/script>');
    html = html.replace(
      new RegExp(`<script[^>]*src="[^"]*${f}"[^>]*></script>`),
      `<script type="module">\n${safe}\n</script>`
    );
  } else if (f.endsWith('.css')) {
    html = html.replace(
      new RegExp(`<link[^>]*href="[^"]*${f}"[^>]*>`),
      `<style>\n${body}\n</style>`
    );
  }
}

if (/<script[^>]+src=/.test(html) || /<link[^>]+stylesheet/.test(html)) {
  console.error('WARNING: an external reference survived inlining — the page '
    + 'will not be self-contained. Check dist/index.html.');
  process.exit(1);
}

writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB, self-contained)`);
