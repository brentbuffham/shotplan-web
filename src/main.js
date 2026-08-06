import { Screen, mount } from './render/screen.js';
import { drawScreen } from './render/view.js';
import { parseXel, planBounds } from './format/xel.js';
import { demoPlan } from './demo-plan.js';
import { Shell, drawMenus, attachInput } from './ui/shell.js';

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
  drawScreen(screen, shell.plan, filename, {
    ...shell.toggles,
    activeMenu: shell.openMenu,
    status: shell.statusLine(),
    transform: shell.view.transform(),
    highlight: shell.highlight,
    rubber: shell.drag,
  });
  drawMenus(screen, shell);
  display.present();
}

shell.onChange = render;
attachInput(canvas, shell);
load(parseXel(demoPlan()), 'DEMO.XEL');

// --- integer scaling -------------------------------------------------------
const scaleSel = document.getElementById('scale');
const applyScale = () => document.body.style.setProperty('--scale', scaleSel.value);
scaleSel.addEventListener('change', applyScale);
applyScale();

// --- drop a real .XEL to load it ------------------------------------------
const drop = document.getElementById('drop');
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
    // .XEL is cp437/latin1, not UTF-8.
    const buf = new Uint8Array(await file.arrayBuffer());
    let text = '';
    for (let i = 0; i < buf.length; i++) text += String.fromCharCode(buf[i]);
    const plan = parseXel(text);
    load(plan, file.name.toUpperCase());
    drop.textContent = `${filename} — ${plan.holes.length} records, ${plan.links.length} ties`;
  } catch (err) {
    drop.textContent = `failed to parse ${file.name}: ${err.message}`;
    console.error(err);
  }
});
