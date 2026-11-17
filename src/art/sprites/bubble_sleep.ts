import { defineSprite } from '../sprite.ts';

/*
 * A thought bubble, 12×12 (GDD §10.6): sleepiness — a letter Z drifting up and back. Bubbles float above a person's head; the anchor
 * is the tip of the tail. Light paper with a dark outline reads on grass, sand and water alike.
 */

export default defineSprite({
  name: 'bubble_sleep',
  title: 'Пузырёк: сон',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 5, y: 12 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    z: 'stone.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..oooooooo..
          .oWWWWWWWWo.
          oWWzzzzzzWWo
          oWWWWWWzWWWo
          oWWWWWzWWWWo
          oWWWWzWWWWWo
          oWWWzWWWWWwo
          oWWzzzzzzWwo
          .oWWWWWWwwo.
          ..oooWwooo..
          ....oWo.....
          ....oo......
          `,
        `
          ..oooooooo..
          .oWWzzzzzzo.
          oWWWWWWWzWWo
          oWWWWWWzWWWo
          oWWWWWzWWWWo
          oWWWWzWWWWWo
          oWWWzzzzzzwo
          oWWWWWWWWWwo
          .oWWWWWWwwo.
          ..oooWwooo..
          ....oWo.....
          ....oo......
          `,
      ],
      frameMs: 600,
    },
  },
});
