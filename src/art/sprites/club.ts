import { defineSprite } from '../sprite.ts';

/*
 * A club, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): a heavy knotted stick, thick end up.
 */

export default defineSprite({
  name: 'club',
  title: 'Дубина',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
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
          .....oooo.
          ....oDDCCo
          ....oDCBCo
          ...oDCBCBo
          ...oCBCBo.
          ..oCBooo..
          .oCBo.....
          oCBo......
          oBo.......
          .o........
          `,
      ],
    },
  },
});
