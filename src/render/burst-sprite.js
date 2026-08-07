/**
 * Explosion sprite from SHOTPlan v3.0, 44x37 pixels.
 *
 * v3.0 blits a bitmap rather than drawing a star. Two independent captures
 * agree on 44x37: every burst in a full screenshot measured that size with the
 * same lit-pixel count, and a clean crop of a single burst matches it exactly.
 * A procedural routine would not produce that consistency.
 *
 * Taken from the clean crop and quantised to the five colours the sprite is
 * made of. Legend: '.' transparent, 'r' red, 'R' light red, 'Y' yellow,
 * 'W' white.
 *
 * It is deliberately large - roughly 44px across where a collar is 8px - which
 * is why the fired region reads as a solid advancing front rather than a
 * scatter of dots.
 */
export const BURST_W = 44;
export const BURST_H = 37;

export const BURST = [
  '..................R.........................',
  '..................R........R................',
  '.................RR........R................',
  '................RRRR.....RRR................',
  '................RRRRY...RRRR................',
  '...............RRRYRR..RRRRR...........RR...',
  '...............RRYRRR.RRRYYR........RRRRR...',
  'RR............RRRYRRrRYRYYRR......RRrYR.....',
  '.RRRR.........RRRYYRrRRRYRRR....RRRYYYR.....',
  '..RrrRYR.R..rrrRRYYRrrRRYRRRRrRRYYRRYY......',
  '...RRrYRRRRRRRrrRRRWYrRYYYYRrrRYYYRRRR......',
  '.....RRRRR.RRRRrRYRWYRYWYYYrrRYYYYRRR.......',
  '......RRRRRYYYRRrrRWRRYYWYYrrRWYYRRR........',
  '.......RRRRYYYRYYrrrRWWYWYWRYRYYRRR.........',
  '........RRRYYYWWYYYYYWWRRYYWRYWYYYrR.RRRRRR.',
  '.........R..RYYWWWWYRYWWYYWYYRRYRrrRRRRRR...',
  '..........RRRRYRYYYWWWWWWWWWWWYRYRRYRR......',
  '...........RrRRYYYYWRWWWWWWWWWWRYYRYRRR.....',
  'RRRRRRRR.RRRYrrrRRWWWWWWWRWWWWWYRRRRRRR.....',
  '....RRRRRYYR.RRRYYWWWWWWWYWRWWYYYYYRRRR.....',
  '........RRRrrrRYYYWWRWWWYWYWWWRYYYYYYRRR....',
  '...........RRWrYYYYYWWYWRYYYWWRrrRYYYRRYR...',
  '.........RRRYYYYYrrWWWWWRYYWYWRWrrRRRRRYYr..',
  '.......RRRYYYYYrrYWWRRYYYWRYYYYWWrrRRRRRR.R.',
  '.....RRRRRRRrYRrRYWRrRYYRRRYRYYYYYRrrrRRR.RR',
  '....RRRRRRRRRrrrRYRrrRYYRrRRRRRYYYRYRR......',
  '..RRRRYRRRRYRrrRRRRrRRYYRr.YRRRRRYYRRYR.....',
  '.RRRRRRRRRRRRRRRYRRrRRRRRrRRRRRRRRYRRYY.....',
  'RRRRR........RRRRRrRRRYYRrRRYRRRRRRRRRR.....',
  '.............RRRRRr.RRRRRrRRYRRRRRRRRRRR....',
  '.............RRRRR...YYRR..RRRYRRrRRRRRRR...',
  '.............RRR.....YYRR....RYR.......RRR..',
  '.............RR......RRRR.....YRR...........',
  '.....................RRR........R...........',
  '.....................RRR....................',
  '......................R.....................',
  '......................R.....................',
];
