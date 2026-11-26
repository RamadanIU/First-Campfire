import { type Clump, type CrownDef, swayFrames } from '../foliage.ts';
import { segment } from '../rig.ts';
import { composeFrame, defineSprite } from '../sprite.ts';

/*
 * A birch, 30×56 (ADR-033): a tall slender white trunk with dark marks, lit from the left, and an
 * airy crown of small leafy clumps with gaps where the trunk and the branches show (../foliage.ts).
 * The crown is drawn with the grass ramp — birch leaves are lighter and yellower than oak's, and in
 * autumn they turn yellow together with the grass. It sways further and with a longer swing than
 * the oak.
 */

const W = 30;
const H = 56;

const TRUNK = `
  a.....a
  .a...a.
  .aw.aw.
  ..aWwa.
  .aWwva.
  .aWwva.
  .aWkva.
  .aWwva.
  .akwva.
  .aWwva.
  .aWwva.
  .akkva.
  .aWwva.
  .aWwka.
  .aWwva.
  .aWwva.
  .aWwva.
  .aWwva.
  .aWkva.
  .aWwva.
  .akwva.
  .aWwva.
  .aWwva.
  .akkva.
  .aWwva.
  .aWwka.
  .aWwva.
  .aWwva.
  .aWwva.
  .aWwva.
  .aWkva.
  .aWwva.
  .akwva.
  aWWwvva
  aaaaaaa
`;

const CLUMPS: readonly Clump[] = [
  { x: 15, y: 6, r: 4 },
  { x: 10, y: 11, r: 4 },
  { x: 20, y: 10, r: 4 },
  { x: 15, y: 14, r: 4 },
  { x: 6, y: 18, r: 4 },
  { x: 24, y: 17, r: 4 },
  { x: 11, y: 21, r: 4 },
  { x: 20, y: 22, r: 4 },
  { x: 7, y: 28, r: 4 },
  { x: 23, y: 28, r: 4 },
  { x: 15, y: 29, r: 3 },
];

/** Thin dark branches from the trunk up to every clump: they show in the gaps of the crown. */
function branches(): string {
  const cells = Array.from({ length: H }, () => Array<string>(W).fill('.'));
  for (const clump of CLUMPS) {
    const from = { x: clump.x < 15 ? 14 : 16, y: Math.min(40, clump.y + 12) };
    for (const p of segment(from, { x: clump.x, y: clump.y })) {
      if (cells[p.y]) cells[p.y]![p.x] = 'a';
    }
  }
  return cells.map((row) => row.join('')).join('\n');
}

const BIRCH: CrownDef = {
  width: W,
  height: H,
  trunk: composeFrame(W, H, [{ grid: branches() }, { grid: TRUNK, x: 12, y: 21 }]),
  clumps: CLUMPS,
  outline: 'o',
  shades: ['s', 'm', 'l', 'h'],
  seed: 11,
  sway: { amplitude: 2, base: 34, top: 2 },
};

export default defineSprite({
  name: 'birch',
  title: 'Берёза',
  kind: 'object',
  width: W,
  height: H,
  anchor: { x: 15, y: 55 },
  legend: {
    o: 'leaf.0',
    s: 'grass.1',
    m: 'grass.2',
    l: 'grass.3',
    h: 'leaf.4',
    a: 'stone.0',
    k: 'ink.0',
    v: 'bone.0',
    w: 'bone.1',
    W: 'bone.2',
  },
  animations: {
    idle: {
      frames: swayFrames(BIRCH, 8),
      frameMs: [400, 200, 200, 300, 400, 200, 200, 300],
    },
  },
  shadow: { width: 18, height: 5, x: 2 },
});
