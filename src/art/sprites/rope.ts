import { defineSprite } from '../sprite.ts';

/*
 * A rope, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): a coil of twisted cord with a loose end.
 */

export default defineSprite({
  name: 'rope',
  title: 'Верёвка',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'bark.0',
    H: 'hide.2',
    h: 'hide.1',
    d: 'hide.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ...oooo...
          ..oHhHho..
          .oHoooohd.
          .ohoHhohdo
          .oHohoohdo
          .ohoooHhdo
          ..oHhHhdo.
          ...ooodho.
          ......oo..
          `,
      ],
    },
  },
});
