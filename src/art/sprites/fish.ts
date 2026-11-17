import { defineSprite } from '../sprite.ts';

/*
 * A fish, 10×10 — a food resource of epoch 0 (data/resources.json, GDD §5.2): silvery, blue-grey back, forked tail, head to the left.
 */

export default defineSprite({
  name: 'fish',
  title: 'Рыба',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    B: 'water.2',
    b: 'water.1',
    x: 'water.4',
    W: 'stone.3',
    w: 'stone.2',
    s: 'bone.2',
    e: 'ink.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..........
          ..........
          ..oooo..oo
          .oBBBBooBo
          oxeWWWobo.
          oWWWwwobo.
          .osswwoobo
          ..oooo..oo
          ..........
          `,
      ],
    },
  },
});
