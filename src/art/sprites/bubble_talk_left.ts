import { defineSprite } from '../sprite.ts';

/*
 * The speech bubble (./bubble_talk.ts) mirrored, 12×12 (step 2.2): it reaches to the left of the
 * speaker's head — over one who faces right, so that it does not hang over the one it speaks to.
 * The anchor is the tip of the tail.
 */

export default defineSprite({
  name: 'bubble_talk_left',
  title: 'Пузырёк: разговор (влево)',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 10, y: 11 },
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
          ooooooooWWo.
          .......oWo..
          ........oo..
          .........oo.
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
          ooooooooWWo.
          .......oWo..
          ........oo..
          .........oo.
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
          ooooooooWWo.
          .......oWo..
          ........oo..
          .........oo.
          ............
          `,
      ],
      frameMs: [600, 300, 300],
    },
  },
});
