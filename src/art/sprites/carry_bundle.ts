import { defineSprite } from '../sprite.ts';

/*
 * A bundle of branches carried overhead (step 1.7; ADR-033), 18×6: the sticks lie crosswise, tied
 * with a strip of hide, twig ends poking out. The carrier's own raised hands hold it (`hold_*`,
 * `carry_*` of `man` and `woman`): the anchor is the middle of the bundle's lower edge, which lies
 * on the hands (src/render/items.ts `LOAD.hands`). Light from the upper left.
 */

export default defineSprite({
  name: 'carry_bundle',
  title: 'Вязанка над головой',
  kind: 'character',
  width: 18,
  height: 6,
  anchor: { x: 9, y: 6 },
  legend: {
    o: 'bark.0',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
    g: 'hide.1',
  },
  animations: {
    idle: {
      frames: [
        `
          ..o...........o...
          .oDooooooooooooDo.
          oDDCDDDCgDDCDDDCDo
          oCBBCBBBgBBCBBBCBo
          .oBBCBBCgBCBBCBBo.
          ..oooooooooooooo..
        `,
      ],
    },
  },
});
