import { defineSprite } from '../sprite.ts';

/*
 * Mushrooms, 10×10 — a food resource of epoch 0 (data/resources.json, GDD §5.2): a big brown-capped boletus and a small one beside it.
 */

export default defineSprite({
  name: 'mushrooms',
  title: 'Грибы',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    C: 'dirt.2',
    c: 'dirt.1',
    k: 'bark.1',
    S: 'bone.2',
    s: 'bone.1',
    b: 'bone.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..oooo....
          .oCCCco...
          oCCcccco..
          okkkkkko..
          ..oSso.oo.
          ..oSsooCco
          ..oSbookko
          .oSSbbooSo
          ..oooo.oo.
          `,
      ],
    },
  },
});
