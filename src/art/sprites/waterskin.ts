import { defineSprite } from '../sprite.ts';

/*
 * A waterskin, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): a bag of hide full of water, its neck tied, a wooden stopper.
 */

export default defineSprite({
  name: 'waterskin',
  title: 'Бурдюк',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    h: 'hide.1',
    H: 'hide.2',
    d: 'hide.0',
    B: 'bark.1',
    C: 'bark.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ....oo....
          ...oCBo...
          ...oooo...
          ...oHho...
          ..oHhhdo..
          .oHHhhhdo.
          ohHhhhhddo
          ohhhhhhddo
          .ohhhhddo.
          ..oooooo..
          `,
      ],
    },
  },
});
