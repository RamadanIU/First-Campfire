import { defineSprite } from '../sprite.ts';

/*
 * A speech bubble, 12×12 (GDD §10.6, step 2.2): a villager talking — three dots that come one by
 * one, as if the words were being said (the first frame — all three: the feed's icon of «longing
 * for company»). It floats over the one whose turn it is to speak; the anchor
 * is the tip of the tail. Light paper with a dark outline, like the thought bubbles; the tail points
 * down and to the side, as a speech bubble's does.
 */

export default defineSprite({
  name: 'bubble_talk',
  title: 'Пузырёк: разговор',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 1, y: 11 },
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
          ............
          .oooooooooo.
          oWWWWWWWWWWo
          oWWWWWWWWWWo
          oWqqWqqWqqwo
          oWqqWqqWqqwo
          oWWWWWWWWwwo
          .oWWoooooooo
          ..oWo.......
          ..oo........
          .oo.........
          ............
          `,
        `
          ............
          .oooooooooo.
          oWWWWWWWWWWo
          oWWWWWWWWWWo
          oWqqWWWWWWwo
          oWqqWWWWWWwo
          oWWWWWWWWwwo
          .oWWoooooooo
          ..oWo.......
          ..oo........
          .oo.........
          ............
          `,
        `
          ............
          .oooooooooo.
          oWWWWWWWWWWo
          oWWWWWWWWWWo
          oWqqWqqWWWwo
          oWqqWqqWWWwo
          oWWWWWWWWwwo
          .oWWoooooooo
          ..oWo.......
          ..oo........
          .oo.........
          ............
          `,
      ],
      frameMs: [600, 300, 300],
    },
  },
});
