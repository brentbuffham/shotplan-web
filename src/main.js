import { Screen, mount } from './render/screen.js';
import { drawScreen, drawEnvelope, drawMenuBar, drawDetonatorBar, drawStatusBar } from './render/view.js';
import { parseXel, planBounds } from './format/xel.js';
import { demoPlan } from './demo-plan.js';
import { Shell, drawMenus, attachInput } from './ui/shell.js';
import { recoverKey, parseDelays } from './format/delays.js';

const canvas = document.getElementById('screen');
const screen = new Screen();
const display = mount(canvas, screen);
const shell = new Shell();

let filename = 'DEMO.XEL';

function load(plan, name) {
  filename = name;
  shell.planBounds = planBounds(plan);
  shell.setPlan(plan, shell.planBounds);
  render();
}

function render() {
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
    activeMenu: shell.openMenu,
    status: shell.statusLine(),
    transform: shell.view.transform(),
    highlight: shell.highlight,
    rubber: shell.drag,
    isOverview: shell.view.isOverview,
    visualization: shell.vis,
  });
  drawMenus(screen, shell);
  display.present();
}

shell.onChange = render;
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
      fetch('/samples/PRODUCTS.BIN'), fetch('/samples/DELAYS.BIN'),
    ]);
    if (pRes.ok && dRes.ok) {
      const key = recoverKey(new Uint8Array(await pRes.arrayBuffer()));
      shell.delayDb = parseDelays(new Uint8Array(await dRes.arrayBuffer()), key);
    }
  } catch { /* no local database; Calculations will report it */ }

  try {
    const res = await fetch('/samples/TEST3.XEL');
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      load(parseXel(decodeXel(buf)), 'TEST3.XEL');
      drop.textContent = `TEST3.XEL — ${shell.plan.holes.length} records, ${shell.plan.links.length} ties`;
      return;
    }
  } catch { /* no local sample; fall through */ }
  load(parseXel(demoPlan()), 'DEMO.XEL');
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
    const plan = parseXel(decodeXel(buf));
    load(plan, file.name.toUpperCase());
    drop.textContent = `${filename} — ${plan.holes.length} records, ${plan.links.length} ties`;
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
