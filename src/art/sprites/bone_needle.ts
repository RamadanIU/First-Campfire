import { defineSprite } from '../sprite.ts';

/*
 * A bone needle, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): a polished needle with an eye, a sinew thread in it.
 */

export default defineSprite({
  name: 'bone_needle',
  title: 'Костяная игла',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    b: 'bone.0',
    H: 'hide.1',
  },
  animations: {
    idle: {
      frames: [
        `
          .......ooo
          ......oW.o
          .....oWboo
          ....oWbo.H
          ...oWbo..H
          ..oWbo..H.
          .oWbo..H..
          .obo..H...
          oboH.H....
          oo..H.....
          `,
      ],
    },
  },
});
