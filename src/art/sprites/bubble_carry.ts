import { defineSprite } from '../sprite.ts';

/*
 * A thought bubble, 12×12 (GDD §10.6, step 1.12): «I'm carrying it there» — a bundle of sticks tied in
 * the middle. Bubbles float above a person's head; the anchor is the tip of the tail. Light paper
 * with a dark outline reads on grass, sand and water alike.
 */

export default defineSprite({
  name: 'bubble_carry',
  title: 'Пузырёк: несу',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 5, y: 12 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
    t: 'hide.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..oooooooo..
          .oWWWWWWWWo.
          oWWWWWWWWWWo
          oWDCCCtCCDWo
          oWBDCCtCDBWo
          oWDCBCtCBDWo
          oWBBBBtBBBwo
          oWWWWWWWWWwo
          .oWWWWWWwwo.
          ..oooWwooo..
          ....oWo.....
          ....oo......
          `,
      ],
    },
  },
});
