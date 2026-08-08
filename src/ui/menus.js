/**
 * Menu tree, transcribed verbatim from SHOTPLAN.OVR.
 *
 * Turbo Pascal stores these as pipe-separated strings immediately followed by
 * a selector string giving each item's hotkey letter, so both the labels and
 * the accelerators below are the originals rather than reconstructions. The
 * offsets are where each was found, so any of it can be re-checked.
 *
 * Items marked `toggle` render their state in place as `:ON` / `:OFF`, which
 * is how the original shows them.
 */

/**
 * `DS:0x160B` — the reliability subsystem switch.
 *
 * The Calculations menu is built from one of two hard-coded strings, and this
 * byte picks which:
 *
 *     0x000D33  cmp byte ptr [0x160b], 0
 *     0x000D38  je  -> Visualize|Overlap|Time Envelope|Angle of initiation|
 *                      Relief|Quantities                          "VOTARQ"
 *               else-> ...|Quantities|Misfires                    "VOTARQM"
 *
 * It is **false here because it is false in the original**. Decoding every
 * instruction at every byte offset of both `SHOTPLAN.OVR` and `SHOTPLAN.EXE`
 * — 16-bit code is not self-synchronising, so a linear sweep misses code the
 * real flow reaches — finds exactly one instruction that writes this address:
 *
 *     0x032DFA  mov byte ptr [0x160b], 0
 *
 * in a block of global initialisers. Nothing sets it to 1, nothing takes a
 * pointer to it, and `SHOTPLAN.OPT` is line-oriented text rather than a record
 * loaded over those globals. Six further sites read it, all gating reliability
 * warnings, so it switches the whole subsystem and not just a menu entry.
 *
 * `src/calc/misfires.js` is therefore a faithful port of code that v3.0 never
 * runs. The switch is reproduced rather than the outcome hard-coded, so the
 * default matches the original exactly while the recovered calculation stays
 * reachable by flipping one flag.
 */
export const RELIABILITY_ENABLED = false;

/** Trailing `!` in "Clear Plan!" is the original's own emphasis. */
export const MENUS = [
  {
    label: 'Files', hot: 0, // 0x0A1B
    items: [
      { label: 'Load', hot: 0 },
      { label: 'Save', hot: 0 },
      { label: 'Import', hot: 0 },
      { label: 'File manager', hot: 0 },
      { label: 'Clear Plan!', hot: 0 },
      { label: 'Exit', hot: 0 },
    ],
  },
  {
    // Edit opens no dropdown. Clicking it IS the mode switch - the whole menu
    // bar is replaced by EDIT_MENUS. Checked against v3.0; an Edit dropdown
    // listing Add/Remove/Change was a reconstruction, not the program.
    label: 'Edit', hot: 0, entersEditMode: true,
  },
  {
    label: 'Calculations', hot: 0, // VOTARQM / VOTARQ
    items: [
      // Playback speed, confirmed from a screenshot of v3.0's Calculations
      // menu. The binary stores these submenu strings in the same order as
      // their parent items, which makes the mapping unambiguous:
      //   0x04F7 Slow|Medium|Fast   0x0541 Out of sequence|Crowding 80%
      //   0x055E Display|Explore    0x056E Contours|First Movement
      { label: 'Visualize', hot: 0, items: ['Slow', 'Medium', 'Fast'] },       // 0x04F7
      { label: 'Overlap', hot: 0, items: ['Out of sequence', 'Crowding 80%'] }, // 0x0541
      { label: 'Time Envelope', hot: 0, items: ['Display', 'Explore'] },        // 0x055E
      { label: 'Angle of initiation', hot: 0, items: ['Contours', 'First Movement'] }, // 0x056E
      // Display|Explore at 0x055E is shared with Time Envelope rather than
      // belonging to it. Relief has its own explore prompt at 0x15006:
      // "Left/INS to change display position for burden relief or right/DEL
      // to exit".
      { label: 'Relief', hot: 0, items: ['Display', 'Explore'] },
      { label: 'Quantities', hot: 0 },
      // Misfires is appended below, and only when RELIABILITY_ENABLED is set.
    ],
  },
  {
    label: 'Show', hot: 0, // 0x0AEF — OZCTNIBDGHX
    items: [
      { label: 'Overview', hot: 0 },
      { label: 'Zoom', hot: 0 },
      { label: 'Collars only shown', hot: 0 },
      { label: 'Ties', hot: 0, toggle: 'ties' },
      { label: 'Nom. times', hot: 0, toggle: 'nomTimes' },
      { label: 'Inhole delay', hot: 0, toggle: 'inholeDelay' },
      { label: 'Bench', hot: 0, toggle: 'benches' },
      { label: 'Depth/Dia', hot: 0, toggle: 'depthDia' },
      { label: 'Gridlines', hot: 0, toggle: 'gridlines' },
      { label: 'Hole tracks', hot: 0, toggle: 'holeTracks' },
      { label: 'Text strings', hot: 2, toggle: 'texts' },
      { label: 'Boundary', hot: 7, toggle: 'boundary' },
    ],
  },
  {
    label: 'Print/Plot', hot: 0, // 0x0C52 — GQSD
    items: [
      { label: 'Graphics plot', hot: 0 },
      { label: 'Quantities print', hot: 0 },
      { label: 'Summary print', hot: 0 },
      { label: 'Data dump print', hot: 0 },
    ],
  },
  {
    label: 'Options', hot: 0, // 0x0C9C
    items: [
      { label: 'Program', hot: 0 },
      { label: 'Graphics', hot: 0 },
      { label: 'Defaults', hot: 0 },
      { label: 'Status', hot: 0 },
    ],
  },
  { label: 'Quit', hot: 0, confirm: 'Confirm Quit Program ?' }, // 0x0005
];

// The seventh Calculations item exists only when the switch is on, exactly as
// the two menu strings in the overlay do. With RELIABILITY_ENABLED false this
// is a no-op and the menu is the six-item VOTARQ the program actually shows.
if (RELIABILITY_ENABLED) {
  MENUS.find((m) => m.label === 'Calculations').items.push({ label: 'Misfires', hot: 0 });
}

/**
 * Edit mode replaces the whole menu bar, it does not open a dropdown.
 * Transcribed from SHOTPLAN.OVR @0x21A0B, hotkeys ARCSWDZE, and confirmed
 * against a screenshot of v3.0 in edit mode.
 */
export const EDIT_MENUS = [
  // Several of these open a THIRD level. Transcribed from the overlay, offsets
  // relative to base 0x0294B0 where noted; confirmed against a screenshot of
  // v3.0 with Remove > Tie open, which shows exactly
  // "Single Tie | Group inside loop | All ties".
  //
  // "Group inside loop" is the recurring idea: you draw a lasso and the
  // operation applies to everything inside it. That is how the original does
  // bulk edits, and it is worth keeping rather than replacing with a drag-box.
  { label: 'Add', hot: 0, items: ['Hole', 'Pattern', 'Fill-in', 'Bench', 'Dummy hole', 'Tie', 'Lead-in', 'Text', 'Boundary'] },
  {
    label: 'Remove', hot: 0,
    items: [
      { label: 'Holes', hot: 0, items: ['Single Hole', 'Group inside loop', 'All'] },
      { label: 'Bench', hot: 0 },
      { label: 'Tie', hot: 0, items: ['Single Tie', 'Group inside loop', 'All ties'] }, // cs:1021
      { label: 'Lead-in', hot: 0 },
      { label: 'Text', hot: 0 },
      { label: 'Boundary', hot: 0 },
    ],
  },
  {
    label: 'Change', hot: 0,
    items: [
      { label: 'Positions of Holes', hot: 0 },
      { label: 'Hole data', hot: 0 },
      { label: 'Bench', hot: 0, items: ['Move point', 'Add point', 'Remove point'] },
      { label: 'In-hole delay', hot: 0 },
      // The overlay carries a short and a long form of this one; the long form
      // adds the two Flip entries.
      { label: 'Tie', hot: 0, items: ['Single Tie', 'Group inside loop', 'Types swap', 'Flip single tie', 'Flip group inside loop'] },
      { label: 'Lead-in', hot: 0 },
      { label: 'Coordinates', hot: 0, items: ['Change origin', 'Rescale distances', 'Pivot about hole'] },
      { label: 'Text', hot: 0, items: ['Change text string', 'Move position of text'] },
      { label: 'Boundary', hot: 0, items: ['Add point', 'Remove point', 'Move Point'] },
    ],
  },
  { label: 'Show', hot: 0, items: [
    { label: 'Collars only shown', hot: 0 },
    { label: 'Ties', hot: 0, toggle: 'ties' },
    { label: 'Nom. times', hot: 0, toggle: 'nomTimes' },
    { label: 'Inhole delay', hot: 0, toggle: 'inholeDelay' },
    { label: 'Bench', hot: 0, toggle: 'benches' },
    { label: 'Depth/Dia', hot: 0, toggle: 'depthDia' },
    { label: 'Gridlines', hot: 0, toggle: 'gridlines' },
    { label: 'Hole tracks', hot: 0, toggle: 'holeTracks' },
    { label: 'Text strings', hot: 2, toggle: 'texts' },
    { label: 'Boundary', hot: 7, toggle: 'boundary' },
  ] },
  { label: 'Window', hot: 0, items: ['Overview', 'Zoom', 'Expand', 'Contract'] },
  { label: 'Data', hot: 0 },
  { label: 'Exit EDIT', hot: 0 },
];

/**
 * The live toggle strip along the bottom in edit mode, replacing the status
 * bar. Captions are from SHOTPLAN.EXE @0x1EEE - six of the nine Show toggles,
 * the ones that change what you can see well enough to matter while editing.
 */
export const EDIT_STRIP = [
  { caption: 'BENCH', toggle: 'benches' },
  { caption: 'TRACK', toggle: 'holeTracks' },
  { caption: 'TIES', toggle: 'ties' },
  { caption: 'INHOLE', toggle: 'inholeDelay' },
  { caption: 'NOMS', toggle: 'nomTimes' },
  { caption: 'DP/DIA', toggle: 'depthDia' },
];

/**
 * Default display toggles.
 *
 * `Ties` is the only one the original starts with on — confirmed from a
 * screenshot of the Show menu in v3.0.
 */
export const DEFAULT_TOGGLES = {
  ties: true,
  nomTimes: false,
  inholeDelay: false,
  benches: false,
  depthDia: false,
  gridlines: false,
  holeTracks: false,
  texts: false,
  boundary: false,
  collarsOnly: false,
};

/** Normalise submenu entries that were written as bare strings. */
export function itemsOf(entry) {
  if (!entry?.items) return null;
  return entry.items.map((it) =>
    typeof it === 'string' ? { label: it, hot: 0 } : it
  );
}
