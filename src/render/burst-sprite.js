/**
 * Explosion sprite, extracted from a screenshot of SHOTPlan v3.0 mid-Visualize.
 *
 * v3.0 blits a bitmap rather than drawing a star: every burst in the capture is
 * the same 44x37 pixels with the same lit-pixel count, which a procedural
 * routine would not produce. So this is the original artwork, recovered by
 * quantising the screenshot to the five colours the sprite actually uses and
 * despeckling the resampling noise.
 *
 * Legend: '.' transparent, 'r' red, 'R' light red, 'Y' yellow, 'W' white.
 * It is deliberately large — roughly 44px across where a collar is 8px, which
 * is why the fired region reads as a solid front rather than a scatter of dots.
 */
export const BURST_W = 44;
export const BURST_H = 37;

export const BURST = [
  '............................................',
  '..................R.........................',
  '.................RR........R................',
  '................RRRR.....RRR................',
  '................RRRRY...RRRR................',
  '...............RRRYRR..RRRRR...........RR...',
  '...............RRYRRR.RRRYYR........RRRRR...',
  'RR............RRRYRRrRYRYYRR......RRrYR.....',
  '.RRRR.........RRRYYRrRRRYRRR....RRRYYYR.....',
  '..RrrRYW.R..rrrRRYYRrrRRYRRRRrRRYYRRYY......',
  '...RRrYRWWRRRRrrRRRWYrRYYYYRrrRYYYRRRR......',
  '.....RRRRRWWRRRrRYRWYRYWYYYrrRYYYYRRR.......',
  '......RRRRRYWYRRrrRWRRYYWYYrrRWYYRRR........',
  '.......RRRRYYWWYYrrrRWWYWYWRYRYYRRR.........',
  '........RRRYYYWWWYYYYWWRRYYWRYWYYYrR.RRRRR..',
  '.........R..RYYWWWWYRYWWYYWYYRRYRrrRRRRRR...',
  '..........RRRRYRYYYWWWWWWWWWWWYRYRRYRR......',
  '...........RrYYYYYYWRWWWWWWWWWWRYYRYRRR.....',
  '...RRRRR.RRRYrrrYYWWWWWWWRWWWWWYRRRRRRR.....',
  '....RRRRRYYR.RYYYYWWWWWWWYWRWWYYYYYRRRR.....',
  '........RYYrrrYYYYWWRWWWYWYWWWRYYYYYYRRR....',
  '...........YYWrYYYYYWWYWRYYYWWRrrRYYYRRYR...',
  '.........RYYYYYYYrrWWWWWRYYWYWRWrrRRRRRYYr..',
  '.......RRRYYYYYrrYWWRRYYYWRYYYYWWrrRRRRRR.R.',
  '.....RRRRYYYrYYrYYWRrRYYRRRYRYYYYYRrrrRRR.RR',
  '....RRRYYRRRYrrrRYRrrRYYRrRRRRRYYYRYRR......',
  '..RRRRYRRRRYYrrRRRRrRRYYRr.YRRRRRYYRRYR.....',
  '.RRRYYRRRRRRRYRRYRRrRRRRRrRRRRRRRRYRRYY.....',
  'RRYYR........RRRRRrRRRYYRrRRYRRRRRRRRRR.....',
  '.............RRRRRr.RRRRRrRRYRRRRRRRRRRR....',
  '.............RRRRR...YYRR..RRRYRRrRRRRRRR...',
  '.............RRR.....YYRR....RYR.......RRR..',
  '.............RR......RRRR.....YRR...........',
  '.....................RRR........R...........',
  '.....................RRR....................',
  '......................R.....................',
  '............................................',
];
