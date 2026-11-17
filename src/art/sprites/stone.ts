import { defineSprite } from '../sprite.ts';

/*
 * A boulder, 14×10: grey stone lit from the upper left, with a patch of moss on top. Later a
 * source of stone and flint (GDD §5.2).
 */

export default defineSprite({
  name: 'stone',
  title: 'Камень',
  kind: 'object',
  width: 14,
  height: 10,
  anchor: { x: 7, y: 9 },
  legend: {
    o: 'stone.0',
    s: 'stone.1',
    m: 'stone.1',
    l: 'stone.2',
    h: 'stone.3',
    g: 'leaf.3',
    G: 'leaf.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ....oooooo....
          ...olggllmo...
          ..olggGllmso..
          .olgGlmlhllmo.
          .ohhlllhhllmo.
          olllllllllmmso
          omllmmmllmmsso
          .ommmssmmmsso.
          .osssssssssso.
          ..oooooooooo..
          `,
      ],
    },
  },
  shadow: { width: 14, height: 4, x: 1 },
});
