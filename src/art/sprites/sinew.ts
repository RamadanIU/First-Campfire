import { defineSprite } from '../sprite.ts';

/*
 * Sinew, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): a hank of dried tendon cord for sewing and binding.
 */

export default defineSprite({
  name: 'sinew',
  title: 'Жилы',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    Y: 'sand.2',
    y: 'sand.1',
    d: 'sand.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ...oooo...
          ..oYyyYo..
          .oYoooodo.
          .oyo..oyo.
          .oYo..oyo.
          .oyooooYo.
          ..oYyydoo.
          ...ooooyo.
          .......oo.
          `,
      ],
    },
  },
});
