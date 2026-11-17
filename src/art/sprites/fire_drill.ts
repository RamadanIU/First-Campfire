import { defineSprite } from '../sprite.ts';

/*
 * A fire drill, 10×10 — a product of epoch 0 (data/resources.json, GDD §5.2): a spindle standing in the notch of a fireboard, an ember glowing.
 */

export default defineSprite({
  name: 'fire_drill',
  title: 'Сверло для огня',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'bark.0',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
    k: 'ink.0',
    F: 'fire.1',
    f: 'fire.2',
  },
  animations: {
    idle: {
      frames: [
        `
          .....oo...
          .....oDo..
          .....oCo..
          .....oCo..
          .....oCo..
          .....oCo..
          .oooooBooo
          oDDDDDkDDo
          oCBCCfFCBo
          .ooooooooo
          `,
      ],
    },
  },
});
