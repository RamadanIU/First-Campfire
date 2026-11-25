import { type CrownDef, swayFrames } from '../foliage.ts';
import { composeFrame, defineSprite } from '../sprite.ts';

/*
 * A young broadleaf tree (oak), 24×32 (ADR-033): a thin trunk and a small round crown of four
 * leafy clumps (../foliage.ts). Thin and light, it sways more than a grown tree.
 */

const W = 24;
const H = 32;

const TRUNK = `
  A...A
  .A.AA
  .ADBA
  .ADBA
  .ADBA
  .ADBA
  .ADBA
  .ADBA
  .ADBA
  ADCBBA
  AAAAAA
`;

const YOUNG: CrownDef = {
  width: W,
  height: H,
  trunk: composeFrame(W, H, [{ grid: TRUNK, x: 9, y: 21 }]),
  clumps: [
    { x: 12, y: 7, r: 6 },
    { x: 7, y: 12, r: 5 },
    { x: 17, y: 12, r: 5 },
    { x: 12, y: 16, r: 6 },
  ],
  outline: 'o',
  shades: ['s', 'm', 'l', 'h'],
  seed: 5,
  sway: { amplitude: 2, base: 20, top: 2 },
};

export default defineSprite({
  name: 'tree_young',
  title: 'Молодое дерево',
  kind: 'object',
  width: W,
  height: H,
  anchor: { x: 12, y: 31 },
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
    idle: { frames: swayFrames(YOUNG, 8), frameMs: [300, 200, 200, 300, 300, 200, 200, 300] },
  },
  shadow: { width: 16, height: 5, x: 1 },
});
