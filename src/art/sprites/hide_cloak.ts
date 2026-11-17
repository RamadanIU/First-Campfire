import { defineSprite } from '../sprite.ts';

/*
 * A hide cloak, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): a cape of hide with a fur collar and ties at the neck.
 */

export default defineSprite({
  name: 'hide_cloak',
  title: 'Шкура-накидка',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    h: 'hide.1',
    H: 'hide.2',
    d: 'hide.0',
    k: 'bark.1',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..oo..oo..
          .oWWooWwo.
          .oWwWWwwo.
          .oHhkkhdo.
          oHHhkkhhdo
          oHhhhhhhdo
          ohhhhhhhdo
          ohdhhdhddo
          .o.oo.oo.o
          `,
      ],
    },
  },
});
