import { defineSprite } from '../sprite.ts';

/*
 * Birch bark, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): a white roll with dark marks, its brown inner side at the end.
 */

export default defineSprite({
  name: 'birch_bark',
  title: 'Береста',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    b: 'bone.0',
    k: 'stone.0',
    C: 'dirt.2',
    c: 'dirt.1',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..........
          .ooooooo..
          oWWkWWWWoo
          oWWWWkWoco
          owwkwwwocC
          obbbbbbocC
          owwwkwwoco
          .oooooooo.
          ..........
          `,
      ],
    },
  },
});
