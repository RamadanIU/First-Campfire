import { type CrownDef, swayFrames } from '../foliage.ts';
import { composeFrame, defineSprite } from '../sprite.ts';

/*
 * A grown broadleaf tree (oak), 44×52 (ADR-033): a crown of ten leafy clumps over a stout trunk
 * that forks into branches and flares into roots. The crown is built by ../foliage.ts: clumps lit
 * from the upper left, leaves in clusters, dark creases where a nearer clump overlaps one behind,
 * the underside in shade. Wind: eight frames of one swing — the top clumps lean furthest and a
 * moment later than the lower ones, sunlit leaves glint. Only the leaf and bark ramps are used, so
 * a seasonal swap of the leaf ramp recolours the whole crown (step 1.10).
 */

const W = 44;
const H = 52;

const TRUNK = `
  .AA.......AA.
  .ADA.....ACA.
  ..ADA...ACBA.
  ...ADA.ACBA..
  ....ADACBA...
  ....ADDCBA...
  ....ADCCBA...
  ....ADCBBA...
  ....ADCCBA...
  ....AADCBA...
  ....ADCCBA...
  ....ADCBBA...
  ...ADDCCBBA..
  ...ADCCCBBA..
  ..ADDCACCBBA.
  .ADCCA.ACBBBA
  .AAAA...AAAAA
`;

const OAK: CrownDef = {
  width: W,
  height: H,
  trunk: composeFrame(W, H, [{ grid: TRUNK, x: 16, y: 35 }]),
  clumps: [
    { x: 22, y: 9, r: 8 },
    { x: 13, y: 13, r: 7 },
    { x: 31, y: 12, r: 8 },
    { x: 8, y: 22, r: 7 },
    { x: 36, y: 21, r: 7 },
    { x: 17, y: 19, r: 8 },
    { x: 28, y: 19, r: 8 },
    { x: 11, y: 29, r: 7 },
    { x: 33, y: 29, r: 7 },
    { x: 22, y: 27, r: 9 },
  ],
  outline: 'o',
  shades: ['s', 'm', 'l', 'h'],
  seed: 3,
  sway: { amplitude: 2, base: 36, top: 2 },
};

export default defineSprite({
  name: 'tree',
  title: 'Лиственное дерево (дуб)',
  kind: 'object',
  width: W,
  height: H,
  anchor: { x: 22, y: 51 },
  legend: {
    o: 'leaf.0',
    s: 'leaf.1',
    m: 'leaf.2',
    l: 'leaf.3',
    h: 'leaf.4',
    A: 'bark.0',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
  },
  animations: {
    idle: { frames: swayFrames(OAK, 8), frameMs: [300, 200, 200, 300, 300, 200, 200, 300] },
  },
  shadow: { width: 34, height: 8, x: 2 },
});
