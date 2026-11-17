import { defineSprite } from '../sprite.ts';

/*
 * Sticks, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): two straight sticks for poles, spears and handles.
 */

export default defineSprite({
  name: 'sticks',
  title: 'Палки',
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
          .......oo.
          ......oDCo
          .....oDCo.
          ..oooDCo..
          .oDCCBo...
          oDCBoo.oo.
          oCBo..oDCo
          .oo..oDCo.
          ....oDCo..
          ....ooo...
          `,
      ],
    },
  },
});
