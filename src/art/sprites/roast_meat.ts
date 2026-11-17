import { defineSprite } from '../sprite.ts';

/*
 * Roast meat, 10×10 — a food resource of epoch 0 (data/resources.json, GDD §5.2): a leg roasted on the fire, brown and crisp, the bone sticking out.
 */

export default defineSprite({
  name: 'roast_meat',
  title: 'Жареное мясо',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    b: 'bone.1',
    C: 'hide.2',
    c: 'dirt.2',
    m: 'dirt.1',
    d: 'dirt.0',
  },
  animations: {
    idle: {
      frames: [
        `
          .......oo.
          ......oWWo
          ......oWbo
          ...oooobo.
          ..oCCcoo..
          .oCCccmo..
          oCccmmmo..
          ocmmmmdo..
          odmmddo...
          .ooooo....
          `,
      ],
    },
  },
});
