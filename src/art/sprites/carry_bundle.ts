import { defineSprite } from '../sprite.ts';

/*
 * Carrying a bundle of branches over the head (step 1.7), 16×14: the sticks lie crosswise, tied
 * with a strip of hide, and both arms are raised to hold them — drawn over a villager (src/render/
 * villagers.ts): the arms rise from the shoulders beside the head, the bundle lies just above it.
 * The anchor is at the shoulders' line, 10 px above the villager's feet. Skin is the `skin_light`
 * ramp, recoloured like the villager's own; light from the upper left (the left arm is lighter).
 */

export default defineSprite({
  name: 'carry_bundle',
  title: 'Вязанка над головой',
  kind: 'character',
  width: 16,
  height: 14,
  anchor: { x: 8, y: 13 },
  legend: {
    o: 'bark.0',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
    g: 'hide.1',
    x: 'ink.0',
    s: 'skin_light.0',
    k: 'skin_light.1',
    K: 'skin_light.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ..o.........o...
          .oDoooooooooDoo.
          oDCDDDCgDDCDDCDo
          oCBBCBBgBBCBBCBo
          .ooxoooxoooooxo.
          .xKkx......xksx.
          .xKkx......xksx.
          .xKkx......xksx.
          ..xKx......xkx..
          ..xKx......xkx..
          ..xKx......xkx..
          ..xKx......xkx..
          ..xKx......xkx..
          ..xxx......xxx..
          `,
      ],
    },
  },
});
