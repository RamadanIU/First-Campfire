import { defineSprite } from '../sprite.ts';

/*
 * Small game, 10×10 — a food resource of epoch 0 (data/resources.json, GDD §5.2): a hare, ears up, white tail.
 */

export default defineSprite({
  name: 'small_game',
  title: 'Мелкая дичь',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    h: 'hide.1',
    H: 'hide.2',
    d: 'hide.0',
    e: 'ink.0',
    W: 'bone.2',
  },
  animations: {
    idle: {
      frames: [
        `
          .o.o......
          oHoho.....
          oHoho.....
          .oHhooo...
          oHeHhhhoo.
          oHhhhhhhdo
          .ohhhhhhWo
          .ohhhhhddo
          ..ohoooho.
          ..oo...oo.
          `,
      ],
    },
  },
});
