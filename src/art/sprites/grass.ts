import { defineSprite } from '../sprite.ts';

/**
 * Meadow grass, the basic map tile. No outline (GDD §10.1). Low-contrast tufts — light tips,
 * dark bases — are spread unevenly so that repeating the tile does not form a visible grid;
 * tufts crossing an edge continue on the opposite side, so the tile is seamless.
 */
export default defineSprite({
  name: 'grass',
  title: 'Трава',
  kind: 'tile',
  width: 16,
  height: 16,
  anchor: { x: 0, y: 0 },
  legend: {
    d: 'grass.0',
    s: 'grass.1',
    m: 'grass.2',
    l: 'grass.3',
  },
  animations: {
    idle: {
      frames: [
        `
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmlmsmmm
        mmlmlmmmmmmsmsmm
        mmmsmmmmmmmmmmmm
        mmmdmmmmmmmmmmmm
        mmmmsmmmmmmmmmml
        mmmmmmmmmmmlmmsm
        mmmmmmsmsmmmmmmm
        smmmmmmdmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmlmsm
        mmmmmmmlmmmmmsmm
        mmmmlmmmmmmmmmmm
        mmmsmmmmsmsmmmmm
        mmmmmmmmmdmmmmms
        mlmmmmmmmmmmmmmm
        `,
      ],
    },
  },
});
