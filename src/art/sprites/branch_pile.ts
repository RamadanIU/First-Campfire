import { defineSprite } from '../sprite.ts';

/*
 * A pile of branches at the camp, 18×11: dry sticks gathered for the fire and stacked crosswise.
 * Every stick is lit on its upper edge. Steps of size (step 1.7, a stack of the pile —
 * data/resources.json `pile`): `small` — a few sticks, `medium` — a low heap, `idle` — a full one.
 */

export default defineSprite({
  name: 'branch_pile',
  title: 'Куча веток',
  kind: 'object',
  width: 18,
  height: 11,
  anchor: { x: 9, y: 10 },
  legend: {
    o: 'bark.0',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
  },
  animations: {
    idle: {
      frames: [
        `
          ..................
          ..............oo..
          ...oo.......ooDDo.
          ..oCDooo.oooDDBBo.
          .ooCBDDooDDDBBooo.
          oCDooooDDBBBoooDDo
          oCBDDDDoooooDDDBBo
          .ooBBBooDDDDBBBoo.
          .oCoooCDBBBBoooBo.
          ..ooooCBooooBooo..
          ......oo...oo.....
          `,
      ],
    },
    // Steps of size (step 1.7): the pile at the camp grows — a few sticks, then a heap, then `idle`.
    small: {
      frames: [
        `
          ..................
          ..................
          ..................
          ..................
          ..................
          ..................
          .......oo.........
          ...oo.oDCo..oo....
          ..oDCooBDCooDCo...
          ...ooBDDoBDDCoo...
          .....oooo.oooo....
          `,
      ],
    },
    medium: {
      frames: [
        `
          ..................
          ..................
          ..................
          ..................
          .........oo.......
          ...oo..ooDDo......
          ..oCDoooDDBBo.oo..
          .ooCBDDoDBBooDDo..
          .oCDoooDDBoDDDBo..
          .oCBDDDooooDBBoo..
          ..oooooCBoooooo...
          `,
      ],
    },
  },
  shadow: { width: 18, height: 4, x: 1 },
});
