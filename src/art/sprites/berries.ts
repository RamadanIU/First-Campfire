import { defineSprite } from '../sprite.ts';

/*
 * Berries, 10×10 — a food resource of epoch 0 (data/resources.json, GDD §5.2): a raspberry with a leaf, glints of light on the side facing the upper
 * left. One stack lying on the ground and the icon of the resource.
 */

export default defineSprite({
  name: 'berries',
  title: 'Ягоды',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    g: 'leaf.2',
    l: 'leaf.3',
    x: 'bone.2',
    r: 'berry.1',
    R: 'berry.0',
  },
  animations: {
    idle: {
      frames: [
        `
          .....lg...
          ....oglo..
          ...orrxro.
          ..orxrrRro
          ..orRrxrRo
          .orrxrRrro
          .oRrRrrRRo
          .oRRrRRRo.
          ..oRRRoo..
          ...ooo....
          `,
      ],
    },
  },
});
