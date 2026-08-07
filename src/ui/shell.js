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
import { PLOT } from '../render/view.js';
import { MENUS, EDIT_MENUS, DEFAULT_TOGGLES, itemsOf } from './menus.js';
import { ViewState, pickHole } from './viewstate.js';
import { computeTimes } from '../calc/timing.js';
import { overlapProbabilities } from '../calc/overlap.js';
import { timeField } from '../calc/contour.js';
import { loadPlan, savePlan, importSurvey } from './files.js';
import { addTie, TIE_PROMPT } from './edit.js';
import { Visualization, VISUALIZE_PROMPT, SPEEDS } from '../calc/visualize.js';

/** Verbatim from SHOTPLAN.EXE @0x2CA8 — the original's own zoom prompt. */
const ZOOM_PROMPT =
  'Left/Ins button accept zoom window - Right/Del button expand/contract.';

const inPlot = (px, py) =>
  px >= PLOT.x0 && px <= PLOT.x1 && py >= PLOT.y0 && py <= PLOT.y1;

const CELL_W = 8;
const CELL_H = 16;
const MENU_START = 1;
const MENU_GAP = 4;

/** Character column where each top-level menu label starts. */
export function menuColumns(menus = MENUS) {
  const cols = [];
  let col = MENU_START;
  for (const m of menus) {
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

    // --- plan navigation ---
    this.view = new ViewState();
    this.plan = null;
    this.zoomMode = false;   // Show > Zoom / Edit > Window > Zoom
    this.drag = null;        // {x0,y0,x1,y1} while dragging a zoom window
    this.pan = null;         // {px,py} while right-dragging
    this.highlight = null;   // hole under the cursor
    this.readout = '';       // cursor position / hole data

    // --- calculations ---
    this.delayDb = null;     // parsed DELAYS.BIN, or null
    this.times = null;       // computeTimes() result for the loaded plan
    this.vis = null;         // running Visualization, if any
    this.envelope = null;    // {mode: 'Display'|'Explore'} when showing it
    this.overlap = null;     // {metric, result} when showing Overlap
    this.contour = null;     // {mode, field, step} when showing contours
    this.quantities = false; // showing the Quantities report

    // --- edit mode ---
    this.editMode = false;
    this.editOp = null;      // e.g. 'Tie'
    this.armedSlot = -1;     // index into the surface detonator bar
    this.tieFrom = null;     // 1-based hole index, once the first is picked
  }

  /**
   * Recompute firing times. Without a delay database there is nothing to
   * compute from, which is the condition the original reports as
   * "Error: This calculation requires an up-to-date database."
   */
  recompute() {
    this.times = (this.plan && this.delayDb)
      ? computeTimes(this.plan, this.delayDb, { mode: 'nominal' })
      : null;
  }

  startVisualize(speed = 'Medium') {
    if (!this.times) {
      this.status = 'Error: This calculation requires an up-to-date database.';
      this.close();
      return;
    }
    if (!this.times.order.length) {
      this.status = 'Excuse me! You dont have any holes firing on this plan!';
      this.close();
      return;
    }
    this.vis = new Visualization(this.times, SPEEDS[speed] ?? SPEEDS.Medium);
    this.status = '';
    this.close();
  }

  /** Calculations > Time Envelope > Display|Explore */
  startEnvelope(mode) {
    if (!this.times) {
      this.status = 'Error: This calculation requires an up-to-date database.';
      this.close();
      return;
    }
    if (!this.times.fire.size) {
      this.status = 'Excuse me! You dont have any holes firing on this plan!';
      this.close();
      return;
    }
    this.envelope = { mode };
    this.status = '';
    this.close();
  }

  /**
   * Calculations > Overlap > Out of sequence | Crowding 80%
   *
   * Runs the simulation up front. A few hundred trials over a few hundred
   * adjacent pairs is a couple of hundred milliseconds, so it is done once on
   * entry rather than per frame - panning and zooming must stay responsive.
   */
  startOverlap(metric) {
    if (!this.times) {
      this.status = 'Error: This calculation requires an up-to-date database.';
      this.close();
      return;
    }
    if (this.times.fire.size < 2) {
      this.status = 'Excuse me! There are less than two holes present on your plan';
      this.close();
      return;
    }
    const result = overlapProbabilities(this.plan, this.delayDb, { trials: 300 });
    this.overlap = { metric, result };
    this.status = '';
    this.close();
  }

  /**
   * Calculations > Angle of initiation > Contours | First Movement
   *
   * Both read the MEAN firing-time field, not the nominal one - v3.0 captions
   * the plot "Contours of mean hole firing times".
   */
  startContours(mode, sub = 'Display') {
    if (!this.times) {
      this.status = 'Error: This calculation requires an up-to-date database.';
      this.close();
      return;
    }
    const times = computeTimes(this.plan, this.delayDb, { mode: 'mean' });
    const field = timeField(this.plan, times);
    if (field.holes.length < 3) {
      this.status = 'Excuse me!  There are no holes firing in this plan.';
      this.close();
      return;
    }
    this.contour = { mode, sub, field, step: 0, cursor: null };
    this.status = '';
    this.close();
  }

  stopContours() {
    this.contour = null;
    this.onChange();
  }

  stopOverlap() {
    this.overlap = null;
    this.onChange();
  }

  stopEnvelope() {
    this.envelope = null;
    this.onChange();
  }

  stopVisualize() {
    this.vis = null;
    this.onChange();
  }

  /**
   * Called when a new plan is loaded.
   *
   * Display toggles are switched on for whatever the plan actually contains.
   * v3.0 does this: loading DHDETC.XEL (holes and ties only) leaves everything
   * but Ties off, while loading TEST3.XEL (which has a bench, a boundary and a
   * text string) comes up with Bench, Boundary and Text strings all ON.
   */
  setPlan(plan, bounds) {
    this.plan = plan;
    this.view.overview(bounds, plan);
    this.highlight = null;
    this.readout = '';
    this.toggles = { ...DEFAULT_TOGGLES };
    if (plan) {
      this.toggles.ties = plan.links.length > 0;
      this.toggles.benches = plan.benches.length > 0;
      this.toggles.boundary = plan.boundary.length > 0;
      this.toggles.texts = plan.texts.length > 0;
    }
    this.vis = null;
    this.envelope = null;
    this.overlap = null;
    this.contour = null;
    this.quantities = false;
    this.recompute();
  }

  /**
   * The nominal delay of a hole's in-hole detonator, for the Inhole delay
   * label. Needs the delay database; without one there is nothing to show.
   */
  inholeDelayOf(hole) {
    if (!this.delayDb || !this.plan) return null;
    const inHole = this.plan.detonators.filter((d) => d.kind === 'in-hole');
    const slot = inHole[hole.delay - 1];
    if (!slot || !slot.defined) return null;
    const want = slot.description.replace(/\s+/g, ' ').trim().toUpperCase();
    const hit = this.delayDb.detonators.find(
      (d) => d.name && want.startsWith(d.name.replace(/\s+/g, ' ').trim().toUpperCase())
    );
    return hit ? hit.nominal : null;
  }

  /** What the status line should show right now. */
  statusLine() {
    if (this.editMode && this.editOp === 'Tie') {
      return this.status || TIE_PROMPT;
    }
    if (this.quantities) return 'Quantities summary      Right/DEL or ESC to exit';
    if (this.contour) {
      // Both captions verbatim from SHOTPLAN.OVR (0x18037, 0x15D54).
      if (this.contour.mode === 'First Movement') {
        return 'Arrows show direction of first movement based on timing contours.';
      }
      if (this.contour.mode === 'Relief') {
        if (this.contour.sub !== 'Explore') {
          return 'Relief in milliseconds per metre between adjacent holes';
        }
        const r = this.contour.reliefAt;
        return r === null || r === undefined
          ? 'Left/INS to change display position for burden relief or right/DEL to exit'
          : `Burden relief ${r.toFixed(1)} ms/m at this position`;
      }
      return `Contours of mean hole firing times are shown in steps of ${this.contour.step} ms`;
    }
    if (this.overlap) {
      // Both captions are verbatim from SHOTPLAN.OVR @0xBB5A.
      return this.overlap.metric === 'reversal'
        ? 'This shows probability of adjacent holes firing out of sequence'
        : 'This shows probability of adjacent holes firing at less than 80% of mean delay';
    }
    if (this.envelope) {
      return this.envelope.mode === 'Explore'
        ? 'Use cursor and Left/INS button to select display range from vertical bar graph'
        : 'Time envelope calculation      Right/DEL or ESC to exit';
    }
    if (this.vis) {
      return this.vis.done
        ? `Blast duration ${Math.round(this.times.duration)} ms   ${this.times.order.length} holes fired   FINISH`
        : VISUALIZE_PROMPT;
    }
    if (this.status) return this.status;
    if (this.zoomMode || this.drag) return ZOOM_PROMPT;
    return this.readout;
  }

  /**
   * Label of the open submenu's PARENT item.
   *
   * `menuLabel` passed to activate() is the top-level menu, which is not
   * enough to disambiguate: "Tie" appears under Add, Remove and Change, and
   * "Display"/"Explore" under both Time Envelope and Relief.
   */
  parentLabel() {
    if (this.openMenu < 0 || this.openSub < 0) return null;
    const items = itemsOf(this.menus[this.openMenu]);
    return items?.[this.openSub]?.label ?? null;
  }

  /** The active menu bar - edit mode replaces it wholesale. */
  get menus() {
    return this.editMode ? EDIT_MENUS : MENUS;
  }

  /** Geometry of the open dropdown, in pixels. */
  dropdownBox() {
    if (this.openMenu < 0) return null;
    const entry = this.menus[this.openMenu];
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
    const menus = this.menus;
    const cols = menuColumns(menus);
    const col = Math.floor(px / CELL_W);
    for (let i = 0; i < menus.length; i++) {
      if (col >= cols[i] && col < cols[i] + menus[i].label.length) return i;
    }
    return -1;
  }

  /** Which detonator slot, if any, is under this pixel? */
  hitDetonatorBar(px, py) {
    if (py < CELL_H || py >= 2 * CELL_H) return -1;
    const slot = Math.floor(px / (10 * CELL_W));
    return slot >= 0 && slot < 8 ? slot : -1;
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

  /** Cursor over the plan: survey readout, hole pick, rubber band, pan. */
  plotMove(px, py) {
    const t = this.view.transform();
    if (!t || !inPlot(px, py)) {
      if (this.readout) { this.readout = ''; this.highlight = null; return true; }
      return false;
    }
    if (this.drag) { this.drag.x1 = px; this.drag.y1 = py; return true; }
    if (this.pan) {
      const dt = this.view.transform();
      this.view.panBy(
        (this.pan.px - px) / dt.scale,
        (py - this.pan.py) / dt.scale
      );
      this.pan = { px, py };
      return true;
    }

    const hole = pickHole(this.plan, t, px, py);
    const e = t.toE(px), n = t.toN(py);
    const before = this.readout;
    if (hole) {
      // Hole numbers are 1-based in the tie-up table, so report them that way.
      this.readout =
        `Hole ${String(hole.index + 1).padStart(4)}  ` +
        `mE ${e.toFixed(2)}  mN ${n.toFixed(2)}  ` +
        `dep ${hole.depth.toFixed(2)}  ang ${hole.angle.toFixed(1)}  ` +
        `dly ${hole.delay}` + (hole.dummy ? '  DUMMY' : '');
    } else {
      this.readout = `mE ${e.toFixed(2)}   mN ${n.toFixed(2)}`;
    }
    const changed = this.highlight !== hole || before !== this.readout;
    this.highlight = hole;
    return changed;
  }

  mouseMove(px, py) {
    let changed = false;
    // Edit mode draws a tool at the pointer, so it has to know where it is.
    if (this.editMode) { this.pointer = { x: px, y: py }; changed = true; }
    if (this.contour && this.contour.mode === 'Relief' && this.contour.sub === 'Explore') {
      this.contour.cursor = { x: px, y: py };
      this.onChange();
      if (this.openMenu < 0) return;
    }
    if (this.envelope) {
      if (this.envelope.mode === 'Explore' && this.envelope.cursorX !== px) {
        this.envelope.cursorX = px;
        this.onChange();
      }
      if (this.openMenu < 0) return;
    }
    if (this.openMenu < 0 && this.plotMove(px, py)) changed = true;
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
        this.activate(sub.items[si], this.menus[this.openMenu].label);
        return;
      }
      const box = this.dropdownBox();
      const i = this.hitBox(box, px, py);
      if (i >= 0) {
        const item = box.items[i];
        if (itemsOf(item)) return; // parent of a submenu; hover opens it
        this.activate(item, this.menus[this.openMenu].label);
        return;
      }
      // Clicked away — close.
      this.close();
      return;
    }
    // --- detonator bar: arm a product ---
    if (this.editMode) {
      const slot = this.hitDetonatorBar(px, py);
      if (slot >= 0) {
        this.armedSlot = slot;
        this.status = '';
        this.onChange();
        return;
      }
    }

    // --- edit: pick holes to tie ---
    if (this.editMode && this.editOp === 'Tie' && inPlot(px, py)) {
      const t = this.view.transform();
      const hole = pickHole(this.plan, t, px, py, 10);
      if (!hole) return;
      const key = hole.index + 1;
      if (this.tieFrom === null) {
        this.tieFrom = key;
        this.status = '';
      } else {
        const r = addTie(this.plan, this.tieFrom, key, this.armedSlot + 1);
        this.status = r.ok ? '' : r.reason;
        this.tieFrom = null;
        if (r.ok) this.recompute();          // firing times change with the tie
      }
      this.onChange();
      return;
    }

    // --- plan area: begin a zoom window ---
    if (inPlot(px, py)) {
      this.status = '';
      this.drag = { x0: px, y0: py, x1: px, y1: py };
      this.onChange();
    }
  }

  /** Left release: accept the zoom window, if it is big enough to mean it. */
  leftRelease(px, py) {
    if (!this.drag) return;
    const d = this.drag;
    // Take the end point from the release itself. Relying on the last
    // mousemove loses the corner when the browser coalesces move events.
    d.x1 = px;
    d.y1 = py;
    this.drag = null;
    const t = this.view.transform();
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    if (t && w > 4 && h > 4) {
      const e0 = t.toE(Math.min(d.x0, d.x1));
      const e1 = t.toE(Math.max(d.x0, d.x1));
      const n0 = t.toN(Math.max(d.y0, d.y1));
      const n1 = t.toN(Math.min(d.y0, d.y1));
      this.view.zoomTo({ minE: e0, maxE: e1, minN: n0, maxN: n1 });
      this.zoomMode = false;
    }
    this.plotMove(px, py);
    this.onChange();
  }

  /**
   * Right button: abort, exactly as the original's prompts describe. Over the
   * plan with nothing in progress it contracts the view, which is what
   * "Right/Del button expand/contract" means.
   */
  rightClick(px, py) {
    if (this.quantities) { this.quantities = false; this.onChange(); return; }
    if (this.contour) { this.stopContours(); return; }
    if (this.overlap) { this.stopOverlap(); return; }
    if (this.envelope) { this.stopEnvelope(); return; }
    if (this.drag) { this.drag = null; this.onChange(); return; }
    if (this.openSub >= 0) {
      this.openSub = -1;
      this.hoverSub = -1;
    } else if (this.openMenu >= 0) {
      this.close();
      return;
    } else if (inPlot(px, py)) {
      this.view.contract();
      this.plotMove(px, py);
    }
    this.onChange();
  }

  /** Wheel zoom about the cursor. Not original; a concession to the mouse. */
  wheel(px, py, deltaY) {
    if (this.openMenu >= 0 || !inPlot(px, py)) return;
    const t = this.view.transform();
    if (!t) return;
    const e = t.toE(px), n = t.toN(py);
    this.view.scale(deltaY > 0 ? 1.25 : 0.8);
    // Keep the point under the cursor fixed.
    const t2 = this.view.transform();
    this.view.panBy(e - t2.toE(px), n - t2.toN(py));
    this.plotMove(px, py);
    this.onChange();
  }

  key(k) {
    if (this.quantities && k === 'Escape') { this.quantities = false; this.onChange(); return; }
    if (this.contour && k === 'Escape') { this.stopContours(); return; }
    if (this.overlap && k === 'Escape') { this.stopOverlap(); return; }
    if (this.envelope && k === 'Escape') { this.stopEnvelope(); return; }
    if (this.vis) {
      if (k === 'Escape') { this.stopVisualize(); return; }
      if (k === ' ') { this.vis.togglePause(); this.onChange(); return; }
    }
    if (k === 'Escape') { this.rightClick(); return; }
    const cols = menuColumns(this.menus);
    const upper = k.toUpperCase();
    if (this.openMenu < 0) {
      const i = this.menus.findIndex((m) => m.label[m.hot].toUpperCase() === upper);
      if (i >= 0) { this.openMenu = i; this.onChange(); }
      return;
    }
    // If a submenu is open, keys resolve against it first.
    const sub = this.submenuBox();
    if (sub) {
      const j = sub.items.findIndex((it) => it.label[it.hot ?? 0]?.toUpperCase() === upper);
      if (j >= 0) { this.activate(sub.items[j], this.menus[this.openMenu].label); return; }
    }
    const box = this.dropdownBox();
    if (!box) return;
    const i = box.items.findIndex((it) => it.label[it.hot ?? 0]?.toUpperCase() === upper);
    if (i < 0) return;
    // An item with a submenu opens it rather than firing — the same as
    // hovering it with the mouse.
    if (itemsOf(box.items[i])) {
      this.hoverItem = i;
      this.openSub = i;
      this.hoverSub = -1;
      this.onChange();
      return;
    }
    this.activate(box.items[i], this.menus[this.openMenu].label);
  }

  activate(item, menuLabel) {
    // Resolve the submenu parent FIRST. Several branches below reset
    // openMenu/openSub, and parentLabel() reads them - computing it late
    // returns null and silently skips the operation.
    const parent = this.parentLabel();
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
    if (menuLabel === 'Calculations' && SPEEDS[item.label] !== undefined) {
      this.startVisualize(item.label);
      return;
    }
    if (menuLabel === 'Calculations' && (item.label === 'Display' || item.label === 'Explore')) {
      // Both Time Envelope and Relief offer Display|Explore, so the choice
      // depends on which parent item is open, not on the label alone.
      if (parent === 'Relief') this.startContours('Relief', item.label);
      else this.startEnvelope(item.label);
      return;
    }
    if (item.label === 'Out of sequence') { this.startOverlap('reversal'); return; }
    if (item.label === 'Contours' || item.label === 'First Movement') {
      this.startContours(item.label);
      return;
    }

    if (item.label === 'Quantities') {
      // Needs no timing and no product database - it counts holes and adds up
      // lengths, which is why v3.0 keeps it available when nothing else is.
      this.quantities = true;
      this.status = '';
      this.close();
      return;
    }
    if (item.label === 'Crowding 80%') { this.startOverlap('crowding'); return; }
    // Navigation — the original's Window vocabulary, shared by Show and Edit.
    switch (item.label) {
      case 'Overview':
        this.view.overview(this.planBounds, this.plan);
        this.status = '';
        this.close();
        return;
      case 'Zoom':
        this.zoomMode = true;
        this.status = '';
        this.close();
        return;
      case 'Expand':
        this.view.expand();
        this.close();
        return;
      case 'Contract':
        this.view.contract();
        this.close();
        return;
    }
    // --- Edit mode --------------------------------------------------------
    // Choosing anything from the Edit menu enters edit mode, which replaces
    // the whole menu bar rather than showing a mode indicator somewhere.
    if (menuLabel === 'Edit' && !this.editMode) {
      this.editMode = true;
      this.editOp = null;
      this.armedSlot = -1;
      this.tieFrom = null;
      // Deliberately does NOT clear openMenu/openSub here - the chosen item
      // still has to run, and close() will clear them when it does.
    }
    if (item.label === 'Exit EDIT') {
      this.editMode = false;
      this.editOp = null;
      this.armedSlot = -1;
      this.tieFrom = null;
      this.status = '';
      this.close();
      return;
    }
    if (this.editMode && item.label === 'Tie' && parent === 'Add') {
      this.editOp = 'Tie';
      this.tieFrom = null;
      // Arm the first defined surface product so a click does something even
      // before the user picks one.
      if (this.armedSlot < 0) this.armedSlot = 0;
      this.status = '';
      this.close();
      return;
    }

    // --- Files menu -------------------------------------------------------
    if (menuLabel === 'Files' && item.label === 'Load') {
      this.close();
      loadPlan().then((r) => {
        if (!r) return;                       // cancelled
        this.onLoad?.(r.plan, r.name);
        this.status = '';
        this.onChange();
      }).catch((e) => {
        this.status = `Error ${e.message} while reading datafile.`;
        this.onChange();
      });
      return;
    }
    if (menuLabel === 'Files' && item.label === 'Save') {
      this.close();
      if (!this.plan) { this.status = 'WARNING the data has not been saved.'; return; }
      savePlan(this.plan, this.filename ?? 'PLAN.XEL').then((name) => {
        if (name) this.status = `Saved ${name}`;
        this.onChange();
      }).catch((e) => {
        this.status = `Disk Full Error - ${e.message}`;
        this.onChange();
      });
      return;
    }
    if (menuLabel === 'Files' && item.label === 'Import') {
      this.close();
      importSurvey().then((r) => {
        if (!r) return;
        this.status = r.rows.length
          ? `${r.name}: ${r.rows.length} survey points read - import not wired to the plan yet`
          : `${r.name}: no numeric rows found`;
        this.onChange();
      }).catch((e) => {
        this.status = `Error ${e.message} while reading datafile.`;
        this.onChange();
      });
      return;
    }

    // Everything else is not implemented yet. Say so plainly rather than
    // silently doing nothing, which reads as a broken click.
    this.status = `${menuLabel} / ${item.label} - not implemented yet`;
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
  // Hotkeys are marked by UNDERLINE ONLY. The original does not recolour them
  // inside dropdowns — checked against a screenshot of v3.0's Show menu, where
  // every accelerator is the same white as its label. Colouring them yellow
  // makes the menu read as far busier than the original.
  const hot = item.hot ?? 0;
  s.hline(x + hot * CELL_W, x + hot * CELL_W + 7, y + 14, fg);
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
    else if (e.button === 1) { shell.pan = { px: x, py: y }; e.preventDefault(); }
    else shell.leftClick(x, y);
  });
  window.addEventListener('mouseup', (e) => {
    const [x, y] = toPixels(e);
    if (e.button === 1) shell.pan = null;
    else if (e.button === 0) shell.leftRelease(x, y);
  });
  canvas.addEventListener('wheel', (e) => {
    shell.wheel(...toPixels(e), e.deltaY);
    e.preventDefault();
  }, { passive: false });
  // Right-drag is a real input in this program, so the page menu must not fire.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || /^[a-zA-Z]$/.test(e.key)) {
      shell.key(e.key);
      e.preventDefault();
    }
  });
}
