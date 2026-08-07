/**
 * Files menu: Load, Save, Import.
 *
 * The original drives these with a DOS file selector on a lettered drive. The
 * browser equivalent is the File System Access API where available, falling
 * back to an `<input type=file>` and a download for browsers that lack it
 * (Firefox and Safari, at time of writing).
 *
 * Deliberately NOT reproduced: the original's file selector UI. A DOS drive
 * picker in a browser would be a museum piece pretending to be a control — the
 * user has a real file system and their own OS dialog for reaching it. The
 * fidelity that matters is what happens to the plan, not how the path is
 * chosen.
 */
import { parseXel } from '../format/xel.js';
import { writeXel } from '../format/xel-write.js';

const XEL_TYPE = {
  description: 'SHOTPlan plan',
  accept: { 'application/octet-stream': ['.XEL', '.xel'] },
};

const hasFsAccess = () => typeof window !== 'undefined'
  && typeof window.showOpenFilePicker === 'function';

/** .XEL is codepage 437, not UTF-8; decoding it as UTF-8 corrupts high bytes. */
export function decodeXel(buf) {
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return s;
}

function encodeXel(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/** Prompt for a file and return {name, bytes}, or null if cancelled. */
async function pickFile(types) {
  if (hasFsAccess()) {
    try {
      const [handle] = await window.showOpenFilePicker({ types, multiple: false });
      const file = await handle.getFile();
      return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    } catch (e) {
      if (e?.name === 'AbortError') return null;   // user cancelled
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.XEL,.xel,.txt,.csv';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
    });
    // A cancelled picker fires no event in older browsers, so this promise may
    // simply never settle. That is benign here - nothing awaits it but the
    // menu action.
    input.click();
  });
}

/** Files > Load */
export async function loadPlan() {
  const picked = await pickFile([XEL_TYPE]);
  if (!picked) return null;
  const text = decodeXel(picked.bytes);
  if (picked.bytes[0] === 0x00 && picked.bytes[1] === 0x2e) {
    throw new Error(`${picked.name} is a CGM plot, not a plan`);
  }
  return { name: picked.name.toUpperCase(), plan: parseXel(text) };
}

/**
 * Files > Save.
 *
 * Writes through the round-tripped writer, so a plan loaded and saved
 * unchanged comes back byte-comparable. Coordinates are written at 7
 * significant figures, matching the original - which means repeated
 * save/reload cycles quantise position exactly as v3.0's do.
 */
export async function savePlan(plan, suggestedName = 'PLAN.XEL') {
  const text = writeXel(plan);
  const bytes = encodeXel(text);
  if (hasFsAccess() && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName, types: [XEL_TYPE],
      });
      const w = await handle.createWritable();
      await w.write(bytes);
      await w.close();
      return handle.name;
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      throw e;
    }
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return suggestedName;
}

/**
 * Files > Import — survey collar positions from a text file.
 *
 * The original reads fixed-column data against a `.IMP` template, which is how
 * you got a mine survey out of a 1993 system. Modern survey exports are
 * delimited, so this accepts whitespace, comma or tab separation and takes the
 * first numeric columns as easting, northing and RL.
 *
 * Field order follows the original's own import fields, whose names appear in
 * SHOTPLAN.EXE: NORTHING, EASTING, DEPTH, DIAMETER, BEARING, RECORD. Note the
 * original lists NORTHING first; this takes EASTING first because every modern
 * export does, and gets it wrong silently otherwise. Column mapping is
 * returned so a caller can show what was assumed.
 */
export function parseSurvey(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const parts = line.split(/[\s,\t;]+/).filter(Boolean);
    const nums = parts.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length < 2) continue;                 // header or comment row
    rows.push({
      e: nums[0],
      n: nums[1],
      rl: nums.length > 2 ? nums[2] : null,
      depth: nums.length > 3 ? nums[3] : null,
    });
  }
  return rows;
}

/** Files > Import */
export async function importSurvey() {
  const picked = await pickFile([{
    description: 'Survey data',
    accept: { 'text/plain': ['.txt', '.csv', '.dat', '.asc'] },
  }]);
  if (!picked) return null;
  return { name: picked.name, rows: parseSurvey(decodeXel(picked.bytes)) };
}
