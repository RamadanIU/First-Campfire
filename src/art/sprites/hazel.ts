import { type CrownDef, type Fruit, swayFrames } from '../foliage.ts';
import { composeFrame, defineSprite } from '../sprite.ts';

/*
 * A hazel bush, 20×17 (step 1.10; ADR-033): winter food — clusters of hazelnuts in their husks
 * among round leafy clumps on a few bare stems (../foliage.ts), swaying a little in the wind (the
 * nuts with their branches). Two states: «nuts» — with nuts, «empty» — picked clean. Nuts can be
 * gathered in autumn and winter (data/objects.json); in winter the leaves are under snow (the
 * seasonal swap of the leaves, src/art/seasons.ts).
 */

const W = 20;
const H = 17;

const STEMS = `
  b.b.b.b
  .b.bb.b
  ..bbbb.
`;

const NUTS = `
  xn.
  ndD
`;
const NUTS_LOW = `
  .xn
  nnD
`;
const CLUSTERS: readonly Fruit[] = [
  { x: 4, y: 6, grid: NUTS },
  { x: 12, y: 4, grid: NUTS_LOW },
  { x: 14, y: 10, grid: NUTS },
  { x: 7, y: 11, grid: NUTS_LOW },
  { x: 10, y: 8, grid: NUTS },
];

const HAZEL: CrownDef = {
  width: W,
  height: H,
  trunk: composeFrame(W, H, [{ grid: STEMS, x: 6, y: 14 }]),
  clumps: [
    { x: 7, y: 5, r: 4 },
    { x: 13, y: 5, r: 4 },
    { x: 4, y: 10, r: 4 },
    { x: 16, y: 10, r: 4 },
    { x: 10, y: 10, r: 5 },
  ],
  outline: 'o',
  shades: ['s', 'm', 'l', 'h'],
  seed: 33,
  sway: { amplitude: 1, base: 13, top: 1 },
};
const FRAME_MS = [400, 300, 300, 400, 400, 300, 300, 400];

export default defineSprite({
  name: 'hazel',
  title: 'Лещина',
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
    x: 'sand.2',
    n: 'dirt.2',
    d: 'dirt.1',
    D: 'dirt.0',
  },
  animations: {
    nuts: { frames: swayFrames({ ...HAZEL, fruit: CLUSTERS }, 8), frameMs: FRAME_MS },
    empty: { frames: swayFrames(HAZEL, 8), frameMs: FRAME_MS },
  },
  shadow: { width: 18, height: 5, x: 1 },
});
