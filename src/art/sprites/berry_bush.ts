import { type CrownDef, type Fruit, swayFrames } from '../foliage.ts';
import { composeFrame, defineSprite } from '../sprite.ts';

/*
 * A berry bush (raspberry), 20×17 (ADR-033): six leafy clumps on a few bare stems (../foliage.ts),
 * swaying a little in the wind. Two states: `ripe` — clusters of red berries among the leaves (they
 * sway with their branches), `empty` — picked clean or out of season (GDD §3.2: a bush bears fruit
 * once a year). A berry has a shaded underside, a few have a glint.
 */

const W = 20;
const H = 17;

const STEMS = `
  .b...b.
  ..b.b..
  ..bbb..
`;

const BERRY = `
  xr
  RR
`;
const BERRY_DARK = `
  rr
  RR
`;
const BERRIES: readonly Fruit[] = [
  { x: 5, y: 5, grid: BERRY },
  { x: 10, y: 2, grid: BERRY },
  { x: 14, y: 6, grid: BERRY_DARK },
  { x: 2, y: 10, grid: BERRY_DARK },
  { x: 8, y: 8, grid: BERRY },
  { x: 12, y: 11, grid: BERRY_DARK },
  { x: 16, y: 10, grid: BERRY_DARK },
  { x: 6, y: 12, grid: BERRY },
];

const BUSH: CrownDef = {
  width: W,
  height: H,
  trunk: composeFrame(W, H, [{ grid: STEMS, x: 7, y: 14 }]),
  clumps: [
    { x: 10, y: 4, r: 4 },
    { x: 6, y: 6, r: 4 },
    { x: 14, y: 6, r: 4 },
    { x: 4, y: 10, r: 4 },
    { x: 16, y: 10, r: 4 },
    { x: 10, y: 9, r: 5 },
  ],
  outline: 'o',
  shades: ['s', 'm', 'l', 'h'],
  seed: 21,
  sway: { amplitude: 1, base: 13, top: 1 },
};
const FRAME_MS = [400, 300, 300, 400, 400, 300, 300, 400];

export default defineSprite({
  name: 'berry_bush',
  title: 'Ягодный куст',
  kind: 'object',
  width: W,
  height: H,
  anchor: { x: 10, y: 16 },
  legend: {
    o: 'leaf.0',
    s: 'leaf.1',
    m: 'leaf.2',
    l: 'leaf.3',
    h: 'leaf.4',
    b: 'bark.1',
    r: 'berry.1',
    R: 'berry.0',
    x: 'bone.2',
  },
  animations: {
    ripe: { frames: swayFrames({ ...BUSH, fruit: BERRIES }, 8), frameMs: FRAME_MS },
    empty: { frames: swayFrames(BUSH, 8), frameMs: FRAME_MS },
  },
  shadow: { width: 18, height: 5, x: 1 },
});
