import { defineSprite } from '../sprite.ts';

/*
 * Edible roots, 10×10 — a food resource of epoch 0 (data/resources.json, GDD §5.2): two pale tapering roots with green tops.
 */

export default defineSprite({
  name: 'roots',
  title: 'Коренья',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'bark.0',
    l: 'leaf.3',
    g: 'leaf.2',
    x: 'sand.2',
    h: 'hide.2',
    d: 'hide.1',
  },
  animations: {
    idle: {
      frames: [
        `
          ..l.g.....
          .lgglg....
          ..ogo..lg.
          .oxhho.go.
          .ohhdooxo.
          ..ohdohhdo
          ..ohdoohdo
          ...odo.odo
          ....o..odo
          ........o.
          `,
      ],
    },
  },
});
