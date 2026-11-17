import { defineSprite } from '../sprite.ts';

/*
 * A thought bubble, 12×12 (GDD §10.6): thirst — a drop of water. Bubbles float above a person's head; the anchor
 * is the tip of the tail. Light paper with a dark outline reads on grass, sand and water alike.
 */

export default defineSprite({
  name: 'bubble_water',
  title: 'Пузырёк: вода',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 5, y: 12 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    b: 'water.1',
    B: 'water.3',
    l: 'water.4',
  },
  animations: {
    idle: {
      frames: [
        `
          ..oooooooo..
          .oWWWWWWWWo.
          oWWWWWbWWWWo
          oWWWWbBbWWWo
          oWWWblBBbWWo
          oWWbllBBBbWo
          oWWbBBBBBbwo
          oWWWbbbbbWwo
          .oWWWWWWwwo.
          ..oooWwooo..
          ....oWo.....
          ....oo......
          `,
      ],
    },
  },
});
