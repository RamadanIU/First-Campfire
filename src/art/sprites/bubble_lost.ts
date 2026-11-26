import { defineSprite } from '../sprite.ts';

/*
 * A thought bubble, 12×12 (GDD §10.6, step 1.12): «I don't know where to go» — a question mark; a
 * villager scouting the unknown land. Bubbles float above a person's head; the anchor is the tip of
 * the tail. Light paper with a dark outline reads on grass, sand and water alike.
 */

export default defineSprite({
  name: 'bubble_lost',
  title: 'Пузырёк: не знаю, куда идти',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 5, y: 12 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    q: 'stone.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..oooooooo..
          .oWWWWWWWWo.
          oWWWqqqqWWWo
          oWWqqWWqqWWo
          oWWWWWWqqWWo
          oWWWWWqqWWWo
          oWWWWqqWWWwo
          oWWWWWWWWWwo
          .oWWWqqWwwo.
          ..oooWwooo..
          ....oWo.....
          ....oo......
          `,
        `
          ..oooooooo..
          .oWWWWWWWWo.
          oWWWWqqqqWWo
          oWWWqqWWqqWo
          oWWWWWWWqqWo
          oWWWWWWqqWWo
          oWWWWWqqWWwo
          oWWWWWWWWWwo
          .oWWWWqqwwo.
          ..oooWwooo..
          ....oWo.....
          ....oo......
          `,
      ],
      frameMs: [900, 500],
    },
  },
});
