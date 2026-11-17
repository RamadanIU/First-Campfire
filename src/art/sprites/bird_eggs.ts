import { defineSprite } from '../sprite.ts';

/*
 * Bird eggs, 10×10 — a food resource of epoch 0 (data/resources.json, GDD §5.2): two pale blue speckled eggs in a nest of dry grass.
 */

export default defineSprite({
  name: 'bird_eggs',
  title: 'Птичьи яйца',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    x: 'bone.2',
    W: 'water.4',
    w: 'water.3',
    b: 'water.2',
    k: 'bark.1',
    h: 'hide.1',
    H: 'hide.2',
    d: 'hide.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..ooo.....
          .oxWwooo..
          .oWwoxWwo.
          .oWkoWwko.
          .obboWwbo.
          ohHhHhHhho
          ohhHhhHhdo
          .odhhhhdo.
          ..oooooo..
          `,
      ],
    },
  },
});
