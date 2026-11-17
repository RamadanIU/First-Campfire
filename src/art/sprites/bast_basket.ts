import { defineSprite } from '../sprite.ts';

/*
 * A bast basket, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): woven of bast strips, with a handle.
 */

export default defineSprite({
  name: 'bast_basket',
  title: 'Корзина из лыка',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'bark.0',
    Y: 'sand.2',
    y: 'sand.1',
    d: 'sand.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..oooooo..
          .oo....oo.
          oYoooooo.o
          oyYyYyYydo
          oYyYyYyYdo
          oyYyYyYydo
          .oyYyYyddo
          .oddddddo.
          ..oooooo..
          `,
      ],
    },
  },
});
