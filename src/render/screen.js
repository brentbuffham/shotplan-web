/**
 * A 640x480 indexed-colour framebuffer, drawn the way the original hardware
 * did it.
 *
 * Pixels are palette *indices*, not RGB. That is not nostalgia — it is what
 * makes exact colour matching trivial, lets us flip palette entries the way
 * BGI did, and keeps the buffer a quarter the size of RGBA. Conversion to RGBA
 * happens once per frame in `blit`.
 *
 * All drawing is integer and unantialiased. Every primitive here has to land
 * on the same pixels DOSBox does, or the screenshots stop being regression
 * tests.
 */
import { FONT, GLYPH_WIDTH, GLYPH_HEIGHT } from './font-data.js';

export const WIDTH = 640;
export const HEIGHT = 480;
export const COLS = WIDTH / GLYPH_WIDTH;   // 80
export const ROWS = HEIGHT / GLYPH_HEIGHT; // 30

/**
 * The 16-colour EGA/VGA text palette, as the default VGA DAC produces it.
 * Index order is the standard IRGB arrangement, so colour 5 is magenta and
 * colour 10 is light green — the two that dominate SHOTPlan's splash screen.
 */
export const EGA = [
  [0x00, 0x00, 0x00], // 0  black
  [0x00, 0x00, 0xaa], // 1  blue
  [0x00, 0xaa, 0x00], // 2  green
  [0x00, 0xaa, 0xaa], // 3  cyan
  [0xaa, 0x00, 0x00], // 4  red
  [0xaa, 0x00, 0xaa], // 5  magenta
  [0xaa, 0x55, 0x00], // 6  brown
  [0xaa, 0xaa, 0xaa], // 7  light grey
  [0x55, 0x55, 0x55], // 8  dark grey
  [0x55, 0x55, 0xff], // 9  light blue
  [0x55, 0xff, 0x55], // 10 light green
  [0x55, 0xff, 0xff], // 11 light cyan
  [0xff, 0x55, 0x55], // 12 light red
  [0xff, 0x55, 0xff], // 13 light magenta
  [0xff, 0xff, 0x55], // 14 yellow
  [0xff, 0xff, 0xff], // 15 white
];

export const BLACK = 0, BLUE = 1, GREEN = 2, CYAN = 3, RED = 4, MAGENTA = 5,
  BROWN = 6, LIGHTGREY = 7, DARKGREY = 8, LIGHTBLUE = 9, LIGHTGREEN = 10,
  LIGHTCYAN = 11, LIGHTRED = 12, LIGHTMAGENTA = 13, YELLOW = 14, WHITE = 15;

/** Typographic characters folded to their codepage-437 equivalents. */
const CP437_FOLD = {
  '—': 0x2d, '–': 0x2d,   // em / en dash -> hyphen
  '‘': 0x27, '’': 0x27,   // curly single quotes
  '“': 0x22, '”': 0x22,   // curly double quotes
  '…': 0x2e,                   // ellipsis -> full stop
  '°': 0xf8, '±': 0xf1,   // degree, plus-minus exist in CP437
  'µ': 0xe6, '≥': 0xf2, '≤': 0xf3,
};

export class Screen {
  constructor(width = WIDTH, height = HEIGHT) {
    this.width = width;
    this.height = height;
    this.buf = new Uint8Array(width * height);
    this.resetClip();
  }

  clear(colour = BLACK) {
    this.buf.fill(colour);
  }

  /**
   * Restrict drawing to a rectangle, inclusive of all four edges.
   *
   * This has to clip horizontally as well as vertically: once the plan can be
   * zoomed, tie lines run off the sides of the plot area, not just the top and
   * bottom, and would otherwise draw over the frame and the cyan desktop.
   */
  setClip(x0, y0, x1, y1) {
    this.clipLeft = Math.max(0, x0 | 0);
    this.clipTop = Math.max(0, y0 | 0);
    this.clipRight = Math.min(this.width - 1, x1 | 0);
    this.clipBottom = Math.min(this.height - 1, y1 | 0);
  }

  resetClip() {
    this.clipLeft = 0;
    this.clipTop = 0;
    this.clipRight = this.width - 1;
    this.clipBottom = this.height - 1;
  }

  px(x, y, c) {
    x |= 0; y |= 0;
    if (x < this.clipLeft || x > this.clipRight) return;
    if (y < this.clipTop || y > this.clipBottom) return;
    this.buf[y * this.width + x] = c;
  }

  get(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.buf[y * this.width + x];
  }

  hline(x0, x1, y, c) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    for (let x = x0; x <= x1; x++) this.px(x, y, c);
  }

  vline(x, y0, y1, c) {
    if (y1 < y0) [y0, y1] = [y1, y0];
    for (let y = y0; y <= y1; y++) this.px(x, y, c);
  }

  /** Bresenham. Integer only — no antialiasing, by design. */
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  rect(x0, y0, x1, y1, c) {
    this.hline(x0, x1, y0, c);
    this.hline(x0, x1, y1, c);
    this.vline(x0, y0, y1, c);
    this.vline(x1, y0, y1, c);
  }

  fillRect(x0, y0, x1, y1, c) {
    for (let y = y0; y <= y1; y++) this.hline(x0, x1, y, c);
  }

  /** Midpoint circle — the same algorithm BGI used. */
  circle(cx, cy, r, c) {
    if (r <= 0) { this.px(cx, cy, c); return; }
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      this.px(cx + x, cy + y, c); this.px(cx + y, cy + x, c);
      this.px(cx - y, cy + x, c); this.px(cx - x, cy + y, c);
      this.px(cx - x, cy - y, c); this.px(cx - y, cy - x, c);
      this.px(cx + y, cy - x, c); this.px(cx + x, cy - y, c);
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
  }

  fillCircle(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      this.hline(cx - w, cx + w, cy + y, c);
    }
  }

  /**
   * Filled convex polygon, scanline. Used for the block arrows the original
   * draws for first movement — a line with barbs reads as a sketch; a filled
   * arrow reads as a direction.
   */
  fillPoly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    minY = Math.max(Math.ceil(minY), this.clipTop);
    maxY = Math.min(Math.floor(maxY), this.clipBottom);
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[j], b = pts[i];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        this.hline(Math.round(xs[k]), Math.round(xs[k + 1]), y, c);
      }
    }
  }

  /**
   * Convex polygon filled with a 45-degree hatch rather than solid.
   *
   * The original hatches its relief bands instead of flooding them, which
   * keeps the holes and the bench lines readable through the fill — on a
   * 16-colour display a solid fill would bury them.
   */
  hatchPoly(pts, c, step = 4) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    minY = Math.max(Math.ceil(minY), this.clipTop);
    maxY = Math.min(Math.floor(maxY), this.clipBottom);
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[j], b = pts[i];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.round(xs[k]), x1 = Math.round(xs[k + 1]);
        for (let x = x0; x <= x1; x++) {
          if (((x + y) % step + step) % step === 0) this.px(x, y, c);
        }
      }
    }
  }

  /**
   * Draw one codepage-437 glyph at pixel position.
   * `bg` of -1 leaves background pixels untouched (transparent text).
   */
  glyph(code, x, y, fg, bg = -1) {
    const base = (code & 0xff) * GLYPH_HEIGHT;
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      const bits = FONT[base + row];
      for (let col = 0; col < GLYPH_WIDTH; col++) {
        const on = (bits >> (7 - col)) & 1;
        if (on) this.px(x + col, y + row, fg);
        else if (bg >= 0) this.px(x + col, y + row, bg);
      }
    }
  }

  /**
   * Draw a string at pixel position.
   *
   * The font is codepage 437, so anything outside it has no glyph. Rather than
   * masking the code point - which silently turns an em dash into the
   * paragraph mark at 0x14 - unmapped characters render as '?', which is
   * visible and traceable. Common typographic substitutes are folded to their
   * ASCII equivalents first.
   */
  text(str, x, y, fg, bg = -1) {
    for (let i = 0; i < str.length; i++) {
      let c = str.codePointAt(i);
      if (c > 0xff) c = CP437_FOLD[str[i]] ?? 0x3f;
      this.glyph(c, x + i * GLYPH_WIDTH, y, fg, bg);
    }
  }

  /**
   * Draw a glyph rotated 90 degrees anticlockwise, for axis labels running up
   * the side of a graph. DOS programs rotate the bitmap rather than using a
   * separate font, so the glyph is simply transposed.
   */
  glyphRot(code, x, y, fg) {
    const base = (code & 0xff) * GLYPH_HEIGHT;
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      const bits = FONT[base + row];
      for (let col = 0; col < GLYPH_WIDTH; col++) {
        if ((bits >> (7 - col)) & 1) this.px(x + row, y + (GLYPH_WIDTH - 1 - col), fg);
      }
    }
  }

  /** Draw a string running bottom-to-top, rotated 90 degrees anticlockwise. */
  textRot(str, x, yBottom, fg) {
    for (let i = 0; i < str.length; i++) {
      this.glyphRot(str.charCodeAt(i), x, yBottom - (i + 1) * GLYPH_WIDTH, fg);
    }
  }

  /** Draw a string at character-cell position (80x30 grid). */
  textAt(str, col, row, fg, bg = -1) {
    this.text(str, col * GLYPH_WIDTH, row * GLYPH_HEIGHT, fg, bg);
  }

  /** Convert the indexed buffer to RGBA for a canvas. */
  blit(imageData) {
    const d = imageData.data;
    const b = this.buf;
    for (let i = 0, j = 0; i < b.length; i++, j += 4) {
      const c = EGA[b[i]];
      d[j] = c[0];
      d[j + 1] = c[1];
      d[j + 2] = c[2];
      d[j + 3] = 255;
    }
  }
}

/**
 * Attach a Screen to a canvas, scaled by an integer factor with nearest
 * neighbour. Non-integer scaling would resample the pixel grid and is
 * deliberately not offered.
 */
export function mount(canvas, screen) {
  canvas.width = screen.width;
  canvas.height = screen.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  const img = ctx.createImageData(screen.width, screen.height);
  return {
    present() {
      screen.blit(img);
      ctx.putImageData(img, 0, 0);
    },
  };
}
