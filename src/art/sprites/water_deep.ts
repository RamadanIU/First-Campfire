import { defineSprite } from '../sprite.ts';

/*
 * Deep water: dark, with slow ripples that swell, break and vanish over four frames. Ripples stay
 * away from the edges: the compositor starts neighbouring tiles at different frames, so a lake
 * does not pulse in step (docs/ART.md, «Вода»).
 */
export default defineSprite({
  name: 'water_deep',
  title: 'Глубокая вода',
  kind: 'tile',
  width: 16,
  height: 16,
  anchor: { x: 0, y: 0 },
  legend: {
    d: 'water.0',
    r: 'water.1',
  },
  animations: {
    idle: {
      frames: [
        `
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddrdrrd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddrrddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        ddddddddrrrrdddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddrrddd
        dddddddddddddddd
        `,
        `
        dddddddddddddddd
        dddrrddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        ddddrrrrdddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddrdrrddd
        dddddddddddddddd
        dddddddddddddddd
        ddddddddddrrrrdd
        dddddddddddddddd
        `,
        `
        dddddddddddddddd
        ddrrrrdddddddddd
        dddddddddddddddd
        dddddddddddrrddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddrdrrddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddrdrrd
        dddddddddddddddd
        `,
        `
        dddddddddddddddd
        dddrdrrddddddddd
        dddddddddddddddd
        ddddddddddrrrrdd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddrrddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        dddddddddddddddd
        `,
      ],
      frameMs: 300,
    },
  },
});
