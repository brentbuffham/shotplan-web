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
    label: 'Edit', hot: 0, // 0x21A0B — hotkeys ARCSWDZE
    items: [
      {
        label: 'Add', hot: 0, // 0x20F99 — HPFBDTLX
        items: ['Hole', 'Pattern', 'Fill-in', 'Bench', 'Dummy hole', 'Tie', 'Lead-in', 'Text', 'Boundary'],
      },
      {
        label: 'Remove', hot: 0, // 0x2101B — HBTLX
        items: ['Holes', 'Bench', 'Tie', 'Lead-in', 'Text', 'Boundary'],
      },
      {
        label: 'Change', hot: 0, // 0x2106E — PHBITLCX
        items: ['Positions of Holes', 'Hole data', 'Bench', 'In-hole delay', 'Tie', 'Lead-in', 'Coordinates', 'Text', 'Boundary'],
      },
      { label: 'Show', hot: 0 },
      {
        label: 'Window', hot: 0, // 0x21297 — OZEC
        items: ['Overview', 'Zoom', 'Expand', 'Contract'],
      },
      { label: 'Data', hot: 0 },
      { label: 'Digitize', hot: 0 },
      { label: 'Exit EDIT', hot: 0 },
    ],
  },
  {
    label: 'Calculations', hot: 0, // 0x0A4B — VOTARQME
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
      { label: 'Relief', hot: 0 },
      { label: 'Quantities', hot: 0 },
      { label: 'Misfires', hot: 0 },
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
