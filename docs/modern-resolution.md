# Note: supporting a modern resolution

Deferred, but the question that decides whether it is feasible is already
answered, so here it is before it is lost.

## The layout constants generalise

Every hardcoded position in `view.js` turns out to be expressible in character
cells, which means the layout is resolution-independent once the cell size is a
variable:

| Hardcoded | In cells | At 640x480, 8x16 |
|---|---|---|
| `FRAME.x0 = 16` | `2 * cellW` | 16 |
| `FRAME.y0 = 48` | `3 * cellH` | 48 |
| `FRAME.x1 = 623` | `w - 2*cellW - 1` | 623 |
| `FRAME.y1 = 440` | `h - 2*cellH - 8` | 440 |
| status bar `y = 464` | `h - cellH` | 464 |

All five reproduce exactly. That is the whole feasibility question: no constant
needs re-deriving from a screenshot, and 640x480 stays byte-identical.

## What it would take

1. **`Screen` gains a font scale.** The 8x16 bitmap is fixed, so at 1920x1080
   each font pixel is drawn as a 2x2 block, giving 16x32 cells. Integer scaling
   only — a fractional font scale would resample the glyphs and lose the reason
   for blitting them in the first place.

2. **`view.js` derives its layout** from `screen.width/height` and the cell
   size rather than module constants.

3. **A resolution selector** on the page, defaulting to 640x480.

Resulting grids:

```
 640 x  480  1x font   80 x 30 characters   (the original)
1280 x  720  2x font   80 x 22
1920 x 1080  2x font  120 x 33
```

## The thing to decide first

At 120x33 there is far more room than the original had, and that is a design
question rather than a technical one: does the extra space go to a **larger plot
area** with the same chrome, or does the chrome grow too? SHOTPlan's menu bar is
sized to its content, so it would simply sit in a wider bar with more empty blue
to the right — which is honest but looks odd.

A 2x font at 1280x720 gives exactly the original's 80 columns, so the chrome
lands identically and only the plot gets taller. That is probably the most
faithful modern mode, and worth trying before 1920x1080.
