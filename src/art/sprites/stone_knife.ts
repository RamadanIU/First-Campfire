import { defineSprite } from '../sprite.ts';

/*
 * A stone knife, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): a flake blade with a handle wrapped in hide.
 */

export default defineSprite({
  name: 'stone_knife',
  title: 'Каменный нож',
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
    H: 'hide.2',
    d: 'hide.1',
    B: 'bark.1',
    C: 'bark.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ........oo
          .......ohl
          ......ohso
          .....ohso.
          ....ohsko.
          ...oHdko..
          ..oHdoo...
          .oCBo.....
          oCBo......
          .oo.......
          `,
      ],
    },
  },
});
