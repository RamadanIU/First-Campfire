import { defineSprite } from '../sprite.ts';

/*
 * A thought bubble, 12×12 (GDD §10.6): cold — a snowflake. Bubbles float above a person's head; the anchor
 * is the tip of the tail. Light paper with a dark outline reads on grass, sand and water alike.
 */

export default defineSprite({
  name: 'bubble_cold',
  title: 'Пузырёк: холод',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 5, y: 12 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    b: 'water.2',
    c: 'water.3',
  },
  animations: {
    idle: {
      frames: [
        `
          ..oooooooo..
          .oWWWWWWWWo.
          oWbWWbWWbWWo
          oWWbWbWbWWWo
          oWWWbcbWWWWo
          oWbbcccbbWWo
          oWWWbcbWWWwo
          oWWbWbWbWWwo
          .oWWWWWWwwo.
          ..oooWwooo..
          ....oWo.....
          ....oo......
          `,
      ],
    },
  },
});
