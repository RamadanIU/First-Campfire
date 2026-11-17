import { defineSprite } from '../sprite.ts';

/*
 * Resin, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): golden drops of resin oozing from a piece of bark; glue for hafting.
 */

export default defineSprite({
  name: 'resin',
  title: 'Смола',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'bark.0',
    x: 'bone.2',
    Y: 'fire.3',
    y: 'fire.2',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..........
          .oooooooo.
          oDCCDCCCBo
          oBCBBCBBBo
          .oxoooxoo.
          ..oYo.oYo.
          ..oYyo.oo.
          ...oyo....
          ....o.....
          `,
      ],
    },
  },
});
