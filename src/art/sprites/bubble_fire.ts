import { defineSprite } from '../sprite.ts';

/*
 * A thought bubble, 12×12 (GDD §10.6, step 1.12): the fire — a flame over two logs; a villager going
 * to light or feed it. Bubbles float above a person's head; the anchor is the tip of the tail.
 * Light paper with a dark outline reads on grass, sand and water alike.
 */

export default defineSprite({
  name: 'bubble_fire',
  title: 'Пузырёк: костёр',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 5, y: 12 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    r: 'fire.0',
    R: 'fire.1',
    y: 'fire.2',
    B: 'bark.1',
    C: 'bark.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ..oooooooo..
          .oWWWWWWWWo.
          oWWWWrWWWWWo
          oWWWWrrWWWWo
          oWWWrRrWWWWo
          oWWrRyRrWWWo
          oWWrRyyRrWwo
          oWWCBrRCBWwo
          .oWWCBCBwwo.
          ..oooWwooo..
          ....oWo.....
          ....oo......
          `,
        `
          ..oooooooo..
          .oWWWWWWWWo.
          oWWWWWrWWWWo
          oWWWWrrWWWWo
          oWWWWrRrWWWo
          oWWWrRyRrWWo
          oWWrRyyRrWwo
          oWWCBrRCBWwo
          .oWWCBCBwwo.
          ..oooWwooo..
          ....oWo.....
          ....oo......
          `,
      ],
      frameMs: 250,
    },
  },
});
