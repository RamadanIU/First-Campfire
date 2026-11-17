import { defineSprite } from '../sprite.ts';

/*
 * Meat of big game, 10×10 — a food resource of epoch 0 (data/resources.json, GDD §5.2): a raw red chunk with streaks of fat. Spoils in two days.
 */

export default defineSprite({
  name: 'meat',
  title: 'Мясо крупной дичи',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    r: 'berry.1',
    R: 'berry.0',
    W: 'bone.2',
    w: 'bone.1',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..........
          ...ooooo..
          ..oWrrrro.
          .orrwWrrRo
          orrrrrwWRo
          orrWrrrrRo
          oRrrwWrRRo
          .oRRRRRRo.
          ..oooooo..
          `,
      ],
    },
  },
});
