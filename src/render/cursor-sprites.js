/**
 * Edit-mode cursor sprites, recovered from screenshots of SHOTPlan v3.0.
 *
 * When you pick Edit > Add > Tie, the pointer becomes a connector. Which
 * connector tells you where you are in the operation:
 *
 *   START  a clamp with a bar through it — waiting for the FIRST hole
 *   END    a clamp with a lead trailing off — waiting for the SECOND
 *
 * That is a nice piece of design: the mode is carried by the thing you are
 * already looking at, so there is no need to read the status line to know
 * whether your next click starts a tie or finishes one.
 *
 * Legend: '.' transparent, 'Y' yellow, 'W' white.
 */

export const CURSOR_START = [
  '...YYYYY...',
  '.YYY....YY.',
  'YY........Y',
  'YY........Y',
  'WWWWWWWWWWW',
  'WWWWWWWWWWW',
  'YY........Y',
  '.Y........Y',
  '..YY....YY.',
  '...YYYYY...',
];

export const CURSOR_END = [
  '...YYYYY...',
  '.YY.....YY.',
  'Y.........Y',
  'Y.........Y',
  'Y.........Y',
  'Y.........Y',
  'Y.........Y',
  '..........Y',
  '........YY.',
  '....YYYY...',
  '...Y.......',
  '...Y.......',
  '....YY.....',
];
