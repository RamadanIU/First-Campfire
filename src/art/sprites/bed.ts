import { defineSprite } from '../sprite.ts';

/*
 * A bed, 28×12 (wide enough for a sleeper of 24, ADR-033): a mound of dry grass with a brown fur
 * spread over it — where people of epoch 0 sleep (stage 1.5). The straw shows at the head end and
 * around the hide.
 */

export default defineSprite({
  name: 'bed',
  title: 'Лежанка',
  kind: 'object',
  width: 28,
  height: 12,
  anchor: { x: 14, y: 11 },
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
          ........oooooooooooo........
          .....oooLLLLLLLLLLLMooo.....
          ...ooLLLLLFFFFFFFFFFFEMoo...
          ..oLLLLLFFFFFFFEFEEFEFEEMo..
          .oLLLLLFFFFFFFEEEEFEEEEEEMo.
          oLLLLMFFFFFFEEEFEEEfEfEfffmo
          oLLMMMMFEFEEEEEEEEEffffffmmo
          .oMMMMMMMFEEfEEfEffffffmmmo.
          ..oMMMMMMmMMffffffffmmmmmo..
          ...ooMMmmMmMmMmmmmmmmmmoo...
          .....ooommmmmmmmmmmmooo.....
          ........oooooooooooo........
          `,
      ],
    },
  },
  shadow: { width: 26, height: 4, x: 1 },
});
