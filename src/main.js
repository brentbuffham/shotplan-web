import { Screen, mount } from './render/screen.js';
import { drawScreen, drawEnvelope, drawOverlap, drawContours, drawRelief, drawReliefLegend, drawQuantities, drawEditMenuBar, drawTiePreview, drawBenchPreview, drawPatternPreview, drawTieMarkers, drawCrossCursor, drawEditStrip, drawCursorSprite, CURSOR_START, CURSOR_END, drawMenuBar, drawDetonatorBar, drawStatusBar } from './render/view.js';
import { parseXel, planBounds } from './format/xel.js';
import { DEMO_PLAN_XEL } from './format/demo-plan-data.js';
import { Shell, drawMenus, attachInput } from './ui/shell.js';
import { recoverKey, parseDelays } from './format/delays.js';
import { demoDelayDb } from './format/demo-delays.js';

const canvas = document.getElementById('screen');
const screen = new Screen();
const display = mount(canvas, screen);
const shell = new Shell();

let filename = 'DEMO.XEL';

function load(plan, name) {
  filename = name;
  shell.filename = name;
  shell.planBounds = planBounds(plan);
  shell.setPlan(plan, shell.planBounds);
  render();
}

function render() {
  if (shell.quantities) {
    drawQuantities(screen, shell.plan);
    drawMenuBar(screen, shell.openMenu);
    drawStatusBar(screen, filename, shell.plan?.title ?? '', shell.statusLine());
    drawMenus(screen, shell);
    display.present();
    return;
  }
  if (shell.contour && shell.contour.mode === 'Relief') {
    drawRelief(screen, shell.plan, shell.contour.field, {
      transform: shell.view.transform(),
      isOverview: shell.view.isOverview,
      cursor: shell.contour.sub === 'Explore' ? shell.contour.cursor : null,
      onSample: (v) => { shell.contour.reliefAt = v; },
    });
    drawMenuBar(screen, shell.openMenu);
    drawReliefLegend(screen);
    drawStatusBar(screen, filename, shell.plan?.title ?? '', shell.statusLine());
    drawMenus(screen, shell);
    display.present();
    return;
  }
  if (shell.contour) {
    const { step } = drawContours(screen, shell.plan, shell.contour.field, {
      transform: shell.view.transform(),
      isOverview: shell.view.isOverview,
      mode: shell.contour.mode,
    });
    if (step) shell.contour.step = step;
    drawMenuBar(screen, shell.openMenu);
    drawDetonatorBar(screen, shell.plan);
    drawStatusBar(screen, filename, shell.plan?.title ?? '', shell.statusLine());
    drawMenus(screen, shell);
    display.present();
    return;
  }
  if (shell.overlap) {
    drawOverlap(screen, shell.plan, shell.overlap.result, {
      transform: shell.view.transform(),
      isOverview: shell.view.isOverview,
      metric: shell.overlap.metric,
    });
    drawMenuBar(screen, shell.openMenu);
    drawDetonatorBar(screen, shell.plan);
    drawStatusBar(screen, filename, shell.plan?.title ?? '', shell.statusLine());
    drawMenus(screen, shell);
    display.present();
    return;
  }
  // Time Envelope replaces the plan view entirely, as it does in v3.0.
  if (shell.envelope) {
    drawEnvelope(screen, shell.times, {
      cursorX: shell.envelope.mode === 'Explore' ? shell.envelope.cursorX : undefined,
    });
    drawMenuBar(screen, shell.openMenu);
    drawStatusBar(screen, filename, shell.plan?.title ?? '', shell.statusLine());
    drawMenus(screen, shell);
    display.present();
    return;
  }
  drawScreen(screen, shell.plan, filename, {
    ...shell.toggles,
    // Label callbacks: the plan renderer should not need to know how firing
    // times are computed, only how to ask for one.
    fireTimeOf: (h) => shell.times?.fire.get(h.index + 1),
    inholeDelayOf: (h) => shell.inholeDelayOf(h),
    activeMenu: shell.openMenu,
    status: shell.statusLine(),
    transform: shell.view.transform(),
    highlight: shell.highlight,
    rubber: shell.drag,
    isOverview: shell.view.isOverview,
    visualization: shell.vis,
  });
  // Edit mode replaces the menu bar and the status line, and gives the
  // pointer a tool. Drawn over the plan the calculations already produced.
  if (shell.editMode) {
    drawEditMenuBar(screen, shell.openMenu);
    drawDetonatorBar(screen, shell.plan, shell.armedSlot);
    // The toggle strip is the resting state; an active operation replaces it
    // with its prompt, as v3.0 does.
    if (shell.editOp) {
      drawStatusBar(screen, filename, shell.plan?.title ?? '', shell.statusLine());
    } else {
      drawEditStrip(screen, shell.toggles);
    }
    if (shell.editOp === 'Tie') {
      drawTiePreview(screen, shell.plan, shell.view.transform(),
        shell.tieFrom, shell.pointer, shell.armedSlot + 1);
    }
    // Picking a tie: v3.0 puts a small white box at each tie's midpoint and
    // turns the cursor into an X. The boxes exist only in these modes.
    if (shell.editOp === 'TieRemove' || shell.editOp === 'TieChange') {
      drawTieMarkers(screen, shell.plan, shell.view.transform());
      if (shell.pointer) drawCrossCursor(screen, shell.pointer.x, shell.pointer.y);
    }
    if (shell.editOp === 'Pattern') {
      drawPatternPreview(screen, shell.view.transform(), shell.pattern);
    }
    if (shell.editOp === 'Bench') {
      drawBenchPreview(screen, shell.view.transform(), shell.benchPoints, shell.pointer);
    }
    if (shell.editOp === 'Tie' && shell.pointer) {
      drawCursorSprite(screen,
        shell.tieFrom === null ? CURSOR_START : CURSOR_END,
        shell.pointer.x, shell.pointer.y);
    }
  }
  drawMenus(screen, shell);
  display.present();
}

// A debug handle. Useful from the console and for driving the app in tests,
// and it exposes nothing a user could not reach through the UI anyway.
window.shotplan = { shell, render, get plan() { return shell.plan; } };

shell.onChange = render;
shell.onLoad = (plan, name) => load(plan, name);
attachInput(canvas, shell);

/**
 * Read a .XEL as cp437/latin1. These files are not UTF-8, and decoding them
 * as such corrupts any byte above 0x7F.
 */
function decodeXel(buf) {
  let text = '';
  for (let i = 0; i < buf.length; i++) text += String.fromCharCode(buf[i]);
  return text;
}

/**
 * Prefer a real plan from samples/ for side-by-side comparison against v3.0
 * running under DOSBox. That directory is gitignored — the sample plans embed
 * a third party's product database — so fall back to a generated plan, which
 * is what anyone cloning this repository will see.
 */
async function boot() {
  // The delay database is what makes Calculations possible at all. It is a
  // third party's data, so it lives only in the gitignored samples/ folder;
  // without it the app still loads plans and simply refuses to calculate,
  // which is what the original does with a stale database.
  try {
    const [pRes, dRes] = await Promise.all([
      fetch('./samples/PRODUCTS.BIN'), fetch('./samples/DELAYS.BIN'),
    ]);
    if (pRes.ok && dRes.ok) {
      const key = recoverKey(new Uint8Array(await pRes.arrayBuffer()));
      shell.delayDb = parseDelays(new Uint8Array(await dRes.arrayBuffer()), key);
    }
  } catch { /* fall through to the synthetic database */ }
  if (!shell.delayDb) {
    // No real product database available - use the synthetic one so the
    // calculations work rather than reporting a stale database. Real plans
    // dropped onto the page will resolve against it only if their product
    // names happen to match; otherwise their delays read as zero, which the
    // status line makes visible.
    shell.delayDb = demoDelayDb();
  }

  try {
    // ?plan=NAME.XEL loads any plan sitting in samples/, which makes it easy
    // to exercise a calculation against a production pattern rather than the
    // small test one.
    const want = new URLSearchParams(location.search).get('plan') ?? 'TEST4.XEL';
    const res = await fetch('./samples/' + want);
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      load(parseXel(decodeXel(buf)), want.toUpperCase());
      drop.textContent = `${want.toUpperCase()} - ${shell.plan.holes.length} records, ${shell.plan.links.length} ties`;
      return;
    }
  } catch { /* no local sample; fall through */ }
  load(parseXel(DEMO_PLAN_XEL), 'DEMO.XEL');
}

const drop = document.getElementById('drop');

// --- integer scaling -------------------------------------------------------
const scaleSel = document.getElementById('scale');
const applyScale = () => document.body.style.setProperty('--scale', scaleSel.value);
scaleSel.addEventListener('change', applyScale);
applyScale();

// --- drop a real .XEL to load it ------------------------------------------
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
document.addEventListener('dragleave', () => drop.classList.remove('over'));
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    // Identify by content, not extension. A .CGM is a binary CGM metafile -
    // a saved *plot*, not a plan - and it opens with BEGIN METAFILE (class 0,
    // element 1). Handing it to the .XEL reader produces a confusing parse
    // error about line numbers in what is not a text file.
    if (buf[0] === 0x00 && buf[1] === 0x2e) {
      drop.textContent = `${file.name} is a CGM plot, not a plan. Drop a .XEL instead.`;
      return;
    }
    const plan = parseXel(decodeXel(buf));
    load(plan, file.name.toUpperCase());
    drop.textContent = `${filename} - ${plan.holes.length} records, ${plan.links.length} ties`;
  } catch (err) {
    drop.textContent = `failed to parse ${file.name}: ${err.message}`;
    console.error(err);
  }
});

boot();

// --- animation loop: only runs while Visualize is active ---
let last = 0;
function frame(now) {
  if (shell.vis) {
    if (shell.vis.tick(now - (last || now))) render();
  }
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
