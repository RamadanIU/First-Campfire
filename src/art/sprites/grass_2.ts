import { defineSprite } from '../sprite.ts';

/*
 * Meadow grass, variation 2 of 3: denser blades and a few dark gaps between them.
 * Same rules as `grass`: no outline, details away from the edges.
 */
export default defineSprite({
  name: 'grass_2',
  title: 'Трава, вариация 2',
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
        mmmsmmmmmmmmmmmm
        mmmmmmmmmmmlmlmm
        mmmmmmmmmmmsmsmm
        mmmmmmmmmmmmmmmm
        mlmlmmmmmmmmmmsm
        msmsmmmmmmlmmmmm
        mmmmmmmmmlslmmmm
        mmmmmmmmmmmmmmmm
        mmmlmmmmmmmmmllm
        mmlslmlmlmmmmssm
        mmmmmmsmsmmmmmmm
        mlmlmmmmmmmmmmmm
        mmsmmmmlmmlmlmmm
        mmmmmmmsmmmsmmmm
        mmmmmdmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        `,
      ],
    },
  },
});
