import { Screen, mount } from './render/screen.js';
import { drawScreen } from './render/view.js';
import { parseXel } from './format/xel.js';
import { demoPlan } from './demo-plan.js';
import { Shell, drawMenus, attachInput } from './ui/shell.js';

const canvas = document.getElementById('screen');
const screen = new Screen();
const display = mount(canvas, screen);
const shell = new Shell();

let plan = parseXel(demoPlan());
let filename = 'DEMO.XEL';

function render() {
  drawScreen(screen, plan, filename, {
    ...shell.toggles,
    activeMenu: shell.openMenu,
    status: shell.status,
  });
  drawMenus(screen, shell);
  display.present();
}

shell.onChange = render;
attachInput(canvas, shell);
render();

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
    plan = parseXel(text);
    filename = file.name.toUpperCase();
    drop.textContent = `${filename} — ${plan.holes.length} records, ${plan.links.length} ties`;
    render();
  } catch (err) {
    drop.textContent = `failed to parse ${file.name}: ${err.message}`;
    console.error(err);
  }
});
