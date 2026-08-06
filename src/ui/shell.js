/**
 * Interaction shell: menu navigation, dropdowns, and the mouse conventions
 * SHOTPlan uses throughout.
 *
 * The original is a two-button DOS program and says so in its own prompts:
 *
 *   "Left/INS Select first hole for overlap evaluation or Right/Del to exit"
 *   "Left/Ins button accept zoom window - Right/Del button expand/contract"
 *
 * So left click selects and right click aborts, everywhere. That is preserved
 * here, which means the browser context menu has to be suppressed over the
 * canvas — right-drag is a real input, not a page gesture.
 */
import { WIDTH, BLUE, CYAN, WHITE, YELLOW, BLACK, LIGHTGREY } from '../render/screen.js';
import { MENUS, DEFAULT_TOGGLES, itemsOf } from './menus.js';

const CELL_W = 8;
const CELL_H = 16;
const MENU_START = 1;
const MENU_GAP = 4;

/** Character column where each top-level menu label starts. */
export function menuColumns() {
  const cols = [];
  let col = MENU_START;
  for (const m of MENUS) {
    cols.push(col);
    col += m.label.length + MENU_GAP;
  }
  return cols;
}

export class Shell {
  constructor() {
    this.toggles = { ...DEFAULT_TOGGLES };
    this.openMenu = -1;      // index into MENUS, -1 = closed
    this.hoverItem = -1;     // index into the open dropdown
    this.openSub = -1;       // index of an open submenu within the dropdown
    this.hoverSub = -1;
    this.status = '';        // transient message line
    this.onChange = () => {};
  }

  /** Geometry of the open dropdown, in pixels. */
  dropdownBox() {
    if (this.openMenu < 0) return null;
    const entry = MENUS[this.openMenu];
    const items = itemsOf(entry);
    if (!items) return null;
    const cols = menuColumns();
    // Width: longest label, plus room for the ":OFF" state column if any
    // item in this menu is a toggle.
    const hasToggle = items.some((i) => i.toggle);
    const labelW = Math.max(...items.map((i) => i.label.length));
    const w = (labelW + (hasToggle ? 6 : 0) + 2) * CELL_W;
    const x = Math.min(cols[this.openMenu] * CELL_W - CELL_W, WIDTH - w - 2);
    return { x, y: 2 * CELL_H, w, h: items.length * CELL_H + 4, items, hasToggle };
  }

  /** Submenu geometry, hanging off the hovered dropdown item. */
  submenuBox() {
    const box = this.dropdownBox();
    if (!box || this.openSub < 0) return null;
    const sub = itemsOf(box.items[this.openSub]);
    if (!sub) return null;
    const labelW = Math.max(...sub.map((i) => i.label.length));
    const w = (labelW + 2) * CELL_W;
    const x = Math.min(box.x + box.w, WIDTH - w - 2);
    const y = box.y + 2 + this.openSub * CELL_H;
    return { x, y, w, h: sub.length * CELL_H + 4, items: sub };
  }

  // ---- hit testing --------------------------------------------------------

  /** Which top-level menu, if any, is under this pixel? */
  hitMenuBar(px, py) {
    if (py >= CELL_H) return -1;
    const cols = menuColumns();
    const col = Math.floor(px / CELL_W);
    for (let i = 0; i < MENUS.length; i++) {
      if (col >= cols[i] && col < cols[i] + MENUS[i].label.length) return i;
    }
    return -1;
  }

  hitBox(box, px, py) {
    if (!box) return -1;
    if (px < box.x || px >= box.x + box.w) return -1;
    const rel = py - box.y - 2;
    if (rel < 0) return -1;
    const i = Math.floor(rel / CELL_H);
    return i >= 0 && i < box.items.length ? i : -1;
  }

  // ---- events -------------------------------------------------------------

  mouseMove(px, py) {
    let changed = false;
    if (this.openMenu >= 0) {
      const sub = this.submenuBox();
      const si = this.hitBox(sub, px, py);
      if (si !== this.hoverSub) { this.hoverSub = si; changed = true; }
      if (si < 0) {
        const i = this.hitBox(this.dropdownBox(), px, py);
        if (i !== this.hoverItem) {
          this.hoverItem = i;
          // Opening a submenu on hover matches the original's feel.
          const box = this.dropdownBox();
          this.openSub = i >= 0 && itemsOf(box.items[i]) ? i : -1;
          this.hoverSub = -1;
          changed = true;
        }
      }
    } else {
      const m = this.hitMenuBar(px, py);
      if (m !== this.hoverItem) { this.hoverItem = m; changed = true; }
    }
    if (changed) this.onChange();
  }

  /** Left button: select. */
  leftClick(px, py) {
    const bar = this.hitMenuBar(px, py);
    if (bar >= 0) {
      this.openMenu = this.openMenu === bar ? -1 : bar;
      this.hoverItem = -1;
      this.openSub = -1;
      this.status = '';
      this.onChange();
      return;
    }
    if (this.openMenu >= 0) {
      const sub = this.submenuBox();
      const si = this.hitBox(sub, px, py);
      if (si >= 0) {
        this.activate(sub.items[si], MENUS[this.openMenu].label);
        return;
      }
      const box = this.dropdownBox();
      const i = this.hitBox(box, px, py);
      if (i >= 0) {
        const item = box.items[i];
        if (itemsOf(item)) return; // parent of a submenu; hover opens it
        this.activate(item, MENUS[this.openMenu].label);
        return;
      }
      // Clicked away — close.
      this.close();
    }
  }

  /** Right button: abort, exactly as the original's prompts describe. */
  rightClick() {
    if (this.openSub >= 0) {
      this.openSub = -1;
      this.hoverSub = -1;
    } else {
      this.close();
    }
    this.onChange();
  }

  key(k) {
    if (k === 'Escape') { this.rightClick(); return; }
    const cols = menuColumns();
    const upper = k.toUpperCase();
    if (this.openMenu < 0) {
      const i = MENUS.findIndex((m) => m.label[m.hot].toUpperCase() === upper);
      if (i >= 0) { this.openMenu = i; this.onChange(); }
      return;
    }
    const box = this.dropdownBox();
    if (!box) return;
    const i = box.items.findIndex((it) => it.label[it.hot ?? 0]?.toUpperCase() === upper);
    if (i >= 0) this.activate(box.items[i], MENUS[this.openMenu].label);
  }

  activate(item, menuLabel) {
    if (item.toggle) {
      this.toggles[item.toggle] = !this.toggles[item.toggle];
      this.status = '';
      this.onChange();
      return; // toggles leave the menu open, as the original does
    }
    if (item.label === 'Collars only shown') {
      this.toggles.collarsOnly = !this.toggles.collarsOnly;
      this.onChange();
      return;
    }
    // Everything else is not implemented yet. Say so plainly rather than
    // silently doing nothing, which reads as a broken click.
    this.status = `${menuLabel} / ${item.label} — not implemented yet`;
    this.close();
  }

  close() {
    this.openMenu = -1;
    this.hoverItem = -1;
    this.openSub = -1;
    this.hoverSub = -1;
    this.onChange();
  }
}

// ---- rendering -------------------------------------------------------------

function drawBox(s, box) {
  s.fillRect(box.x, box.y, box.x + box.w - 1, box.y + box.h - 1, BLUE);
  s.rect(box.x, box.y, box.x + box.w - 1, box.y + box.h - 1, WHITE);
}

function drawItem(s, box, item, i, selected, shell) {
  const y = box.y + 2 + i * CELL_H;
  const x = box.x + CELL_W;
  const bg = selected ? YELLOW : BLUE;
  const fg = selected ? BLACK : WHITE;
  s.fillRect(box.x + 1, y, box.x + box.w - 2, y + CELL_H - 1, bg);
  s.text(item.label, x, y, fg, bg);
  // Hotkey letter, underlined, as the original draws it.
  const hot = item.hot ?? 0;
  s.glyph(item.label.charCodeAt(hot), x + hot * CELL_W, y, selected ? BLACK : YELLOW, bg);
  s.hline(x + hot * CELL_W, x + hot * CELL_W + 7, y + 14, selected ? BLACK : YELLOW);
  // Toggle state, right aligned in its own column.
  if (item.toggle) {
    const state = shell.toggles[item.toggle] ? ':ON ' : ':OFF';
    s.text(state, box.x + box.w - 5 * CELL_W, y, fg, bg);
  }
  // Submenu marker.
  if (itemsOf(item)) s.glyph(0x10, box.x + box.w - CELL_W - 2, y, fg, bg);
}

export function drawMenus(s, shell) {
  const box = shell.dropdownBox();
  if (!box) return;
  drawBox(s, box);
  box.items.forEach((it, i) => drawItem(s, box, it, i, i === shell.hoverItem, shell));

  const sub = shell.submenuBox();
  if (sub) {
    drawBox(s, sub);
    sub.items.forEach((it, i) => drawItem(s, sub, it, i, i === shell.hoverSub, shell));
  }
}

/** Attach mouse and keyboard to a canvas, converting to framebuffer pixels. */
export function attachInput(canvas, shell) {
  const toPixels = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [
      Math.floor(((ev.clientX - r.left) / r.width) * canvas.width),
      Math.floor(((ev.clientY - r.top) / r.height) * canvas.height),
    ];
  };
  canvas.addEventListener('mousemove', (e) => shell.mouseMove(...toPixels(e)));
  canvas.addEventListener('mousedown', (e) => {
    const [x, y] = toPixels(e);
    if (e.button === 2) shell.rightClick(x, y);
    else shell.leftClick(x, y);
  });
  // Right-drag is a real input in this program, so the page menu must not fire.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || /^[a-zA-Z]$/.test(e.key)) {
      shell.key(e.key);
      e.preventDefault();
    }
  });
}
