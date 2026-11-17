import { defineSprite } from '../sprite.ts';

/*
 * Fallen branches, 14×8: dry sticks under the trees that people gather for the fire (stage 1).
 * Lit from the upper left: the top-left edge of every stick is lighter.
 */

export default defineSprite({
  name: 'branches',
  title: 'Ветки на земле',
  kind: 'object',
  width: 14,
  height: 8,
  anchor: { x: 7, y: 7 },
  legend: {
    o: 'bark.0',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
  },
  animations: {
    idle: {
      frames: [
        `
          ..............
          .oo.......oo..
          oDCoo....oDCo.
          .oBDCoo.oDCo..
          ..ooBDDoDCoo..
          ...ooBDCCBDoo.
          ..oDCCoBCoBBDo
          .oCBoo..oo.oo.
          `,
      ],
    },
  },
  shadow: { width: 12, height: 3, x: 1 },
});
