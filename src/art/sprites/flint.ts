import { defineSprite } from '../sprite.ts';

/*
 * Flint, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): a split nodule, dark glassy inside, a chalky white crust outside.
 */

export default defineSprite({
  name: 'flint',
  title: 'Кремень',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    W: 'bone.1',
    w: 'bone.0',
    k: 'stone.0',
    s: 'stone.1',
    L: 'stone.3',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ....ooo...
          ...oWWwo..
          ..oWwkko..
          ..oWkLsko.
          .oWkLskko.
          .owksskko.
          oWwkkkko..
          owwwkoo...
          .ooooo....
          `,
      ],
    },
  },
});
