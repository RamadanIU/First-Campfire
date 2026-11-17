import { defineSprite } from '../sprite.ts';

/*
 * A stake spear, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): a long stick sharpened and hardened in the fire (dark tip).
 */

export default defineSprite({
  name: 'stake_spear',
  title: 'Копьё-кол',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'bark.0',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
    k: 'ink.0',
  },
  animations: {
    idle: {
      frames: [
        `
          .........o
          ........ok
          .......oCk
          ......oDCo
          .....oDBo.
          ....oDBo..
          ...oDBo...
          ..oDBo....
          .oDBo.....
          .ooo......
          `,
      ],
    },
  },
});
