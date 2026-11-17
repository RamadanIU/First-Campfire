import { defineSprite } from '../sprite.ts';

/*
 * A flint-tipped spear, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): a flint point lashed to the shaft with hide.
 */

export default defineSprite({
  name: 'flint_spear',
  title: 'Копьё с кремнёвым наконечником',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    k: 'stone.0',
    s: 'stone.1',
    h: 'stone.3',
    H: 'hide.2',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
  },
  animations: {
    idle: {
      frames: [
        `
          .......ooo
          ......ohso
          ......osko
          .....oHHo.
          ....oDCo..
          ...oDBo...
          ..oDBo....
          .oDBo.....
          oDBo......
          .oo.......
          `,
      ],
    },
  },
});
