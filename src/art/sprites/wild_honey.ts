import { defineSprite } from '../sprite.ts';

/*
 * Wild honey, 10×10 — a food resource of epoch 0 (data/resources.json, GDD §5.2): a slab of honeycomb from a hollow tree, honey dripping from it.
 */

export default defineSprite({
  name: 'wild_honey',
  title: 'Дикий мёд',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'bark.0',
    Y: 'fire.3',
    y: 'fire.2',
    A: 'fire.1',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          .oooooooo.
          oYYYYYYYYo
          oYAAYAAYAo
          oYAAYAAYAo
          oAYYAYYAYo
          oAYYAYYAYo
          oYAAYAAYAo
          .oyAoyAoo.
          ..oo.oo...
          `,
      ],
    },
  },
});
