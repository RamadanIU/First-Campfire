import { defineSprite } from '../sprite.ts';

/*
 * Bast, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): a coil of pale strips of inner bark, for baskets and cords.
 */

export default defineSprite({
  name: 'bast',
  title: 'Лыко',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'bark.0',
    Y: 'sand.2',
    y: 'sand.1',
    d: 'sand.0',
    H: 'hide.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..ooo.....
          .oYYYoooo.
          oYoooYYYYo
          oyo.oHyyyo
          oYo.oHYYYo
          oyooodyyyo
          .oyyyoooo.
          ..ooo.....
          ..........
          `,
      ],
    },
  },
});
