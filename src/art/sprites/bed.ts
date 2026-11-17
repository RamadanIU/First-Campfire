import { defineSprite } from '../sprite.ts';

/*
 * A bed, 18×10: a mound of dry grass with a brown fur spread over it — where people of epoch 0
 * sleep (stage 1.5). The straw shows at the head end and around the hide.
 */

export default defineSprite({
  name: 'bed',
  title: 'Лежанка',
  kind: 'object',
  width: 18,
  height: 10,
  anchor: { x: 9, y: 9 },
  legend: {
    o: 'bark.0',
    L: 'sand.2',
    M: 'sand.1',
    m: 'sand.0',
    F: 'bark.3',
    E: 'bark.2',
    f: 'bark.1',
  },
  animations: {
    idle: {
      frames: [
        `
          .....oooooooo.....
          ...ooMFFFFFFFoo...
          .ooMMFFFFFFEFFFoo.
          oMLLMFFEFEEEEEEffo
          oMMMMFFEEEEEEFEffo
          oLLMMFFEEEFEEEEffo
          oMMMLFFEEFEEEEFffo
          .oMMMFFfffffffffo.
          ..oommmmmmmmmmoo..
          ....oooooooooo....
          `,
      ],
    },
  },
  shadow: { width: 16, height: 3, x: 1 },
});
