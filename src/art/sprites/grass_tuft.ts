import { bendFrames } from '../foliage.ts';
import { defineSprite } from '../sprite.ts';

/*
 * A tuft of tall grass, 12×9: decoration on meadows and at the edge of the forest. In the wind it
 * bends to and fro — the tips up to two pixels, the roots stay (../foliage.ts `bendFrames`); the
 * map makes neighbouring tufts bend one after another, in a wave (ADR-033).
 */

const STILL = `
  ............
  ....l...l...
  ....l..lm...
  ..l.ml.m....
  ..ml.mlm.l..
  ...m.mmmlm..
  ...ms.mmm...
  ...smsmsm...
  ....sssss...
`;

export default defineSprite({
  name: 'grass_tuft',
  title: 'Высокая трава',
  kind: 'object',
  width: 12,
  height: 9,
  anchor: { x: 6, y: 9 },
  legend: {
    l: 'grass.3',
    m: 'grass.1',
    s: 'grass.0',
  },
  animations: {
    idle: { frames: bendFrames(STILL, 8, 1.6), frameMs: [300, 200, 200, 300, 300, 200, 200, 300] },
  },
});
