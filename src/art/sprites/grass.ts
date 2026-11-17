import { defineSprite } from '../sprite.ts';

/*
 * Meadow grass, variation 1 of 3 (the most common). No outline (GDD §10.1): low-contrast blades —
 * a light tip over its shade, lit from above. Multi-pixel details stay one pixel away from the
 * edges, so any two grass variations can lie side by side without a seam (docs/ART.md, «Земля»).
 */
export default defineSprite({
  name: 'grass',
  title: 'Трава',
  kind: 'tile',
  width: 16,
  height: 16,
  anchor: { x: 0, y: 0 },
  legend: {
    s: 'grass.1',
    m: 'grass.2',
    l: 'grass.3',
  },
  animations: {
    idle: {
      frames: [
        `
        mmmmmmmmmlmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmsmmmmm
        mmmmmmmmmmmmlmlm
        mmmmmmmmmmmmsmsm
        mlmlmmlmlmsmmmmm
        msmsmmsmsmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmsmmmm
        mmmlmmmmmmmmmmmm
        mmlslmmmlmlmmmmm
        mmmmmmmmmsmmmmmm
        mmmmmmllmmmmmmmm
        mmmmmmssmmmmmmmm
        mmmmmmmmmmmmmmmm
        `,
      ],
    },
  },
});
