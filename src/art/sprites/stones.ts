import { defineSprite } from '../sprite.ts';

/*
 * Stones, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): three grey stones, one resting on two.
 */

export default defineSprite({
  name: 'stones',
  title: 'Камни',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'stone.0',
    s: 'stone.1',
    l: 'stone.2',
    h: 'stone.3',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..........
          ...ooo....
          ..ohllo...
          ..ollso...
          .ooolsooo.
          ohlloohllo
          ollssollso
          osssooosso
          .ooo..ooo.
          `,
      ],
    },
  },
});
