import { defineSprite } from '../sprite.ts';

/*
 * A thought bubble, 12×12 (GDD §10.6): hunger — a handful of berries. Bubbles float above a person's head; the anchor
 * is the tip of the tail. Light paper with a dark outline reads on grass, sand and water alike.
 */

export default defineSprite({
  name: 'bubble_food',
  title: 'Пузырёк: еда',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 5, y: 12 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    r: 'berry.1',
    R: 'berry.0',
    x: 'bone.2',
    l: 'leaf.3',
    g: 'leaf.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ..oooooooo..
          .oWWWWWWWWo.
          oWWWWWlgWWWo
          oWWWrrlrWWWo
          oWWrxrRrrWWo
          oWWrRrrxrWWo
          oWWWRrRRrWwo
          oWWWWRRWWWwo
          .oWWWWWWwwo.
          ..oooWwooo..
          ....oWo.....
          ....oo......
          `,
      ],
    },
  },
});
