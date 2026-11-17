import { defineSprite } from '../sprite.ts';

/*
 * A pile of branches at the camp, 18×11: dry sticks gathered for the fire and stacked crosswise
 * (stage 1.7 makes the pile grow). Every stick is lit on its upper edge.
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
  },
  shadow: { width: 18, height: 4, x: 1 },
});
