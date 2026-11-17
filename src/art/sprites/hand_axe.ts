import { defineSprite } from '../sprite.ts';

/*
 * A hand axe, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): an almond-shaped stone chipped on both faces.
 */

export default defineSprite({
  name: 'hand_axe',
  title: 'Рубило',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    k: 'stone.0',
    s: 'stone.1',
    l: 'stone.2',
    h: 'stone.3',
  },
  animations: {
    idle: {
      frames: [
        `
          ....oo....
          ...ohlo...
          ...ohso...
          ..ohlsko..
          ..ohsllo..
          .ohlskslo.
          .olsslsko.
          .osklsslo.
          ..oskkko..
          ...oooo...
          `,
      ],
    },
  },
});
