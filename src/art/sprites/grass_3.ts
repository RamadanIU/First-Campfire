import { defineSprite } from '../sprite.ts';

/*
 * Meadow grass, variation 3 of 3: sparse blades and sunlit specks — a calmer patch that
 * breaks the rhythm of the other two. Same rules as `grass`.
 */
export default defineSprite({
  name: 'grass_3',
  title: 'Трава, вариация 3',
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
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmlmmmmmmmmm
        mlmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmlmmmmm
        mmmmmlmmmmmsmmmm
        mmmmmmmmmmmmmmmm
        mmmmlmlmmmmmmmmm
        mmmmsmsmmmmmmmmm
        mmmmmmmmlmlmmmmm
        msmmmmmmmsmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmlmmmm
        `,
      ],
    },
  },
});
