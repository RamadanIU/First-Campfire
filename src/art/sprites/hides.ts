import { defineSprite } from '../sprite.ts';

/*
 * Hides, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): a raw hide spread flat, with the stumps of the legs.
 */

export default defineSprite({
  name: 'hides',
  title: 'Шкуры',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    h: 'hide.1',
    H: 'hide.2',
    d: 'hide.0',
  },
  animations: {
    idle: {
      frames: [
        `
          .oo....oo.
          ohHo..ohdo
          .oHHooHho.
          .oHhhhhho.
          ohhhhhhhdo
          ohHhhhhhdo
          .ohhhhhdo.
          .ohhhhddo.
          ohdooooddo
          .oo....oo.
          `,
      ],
    },
  },
});
