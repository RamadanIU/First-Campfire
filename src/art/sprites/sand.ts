import { defineSprite } from '../sprite.ts';

/*
 * Sand of a river bank: wind ripples and grains, low contrast, no outline. Where sand meets water
 * its edge is darkened to wet sand by the terrain compositor (docs/ART.md, «Переходы»).
 */
export default defineSprite({
  name: 'sand',
  title: 'Песок',
  kind: 'tile',
  width: 16,
  height: 16,
  anchor: { x: 0, y: 0 },
  legend: {
    d: 'sand.0',
    m: 'sand.1',
    l: 'sand.2',
    P: 'stone.2',
  },
  animations: {
    idle: {
      frames: [
        `
        mmmPmmmmmmmmmmmm
        mmmmmmlmmmmmmmmm
        mmmmmmmdmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmlmmmmmm
        mmmmmmlmmmdmmmmm
        mmmmmmmmmmmmmmmm
        mmmmllmmmmmlmmmm
        mmmmmdmmmmmmdmmm
        mmmmmmmmmmmmmmmm
        mllmmmmmmmmmmmmm
        mmdmmmmmmmmmmmmm
        mmmmmlmmlmmlmmmm
        mmmmmmmmmmmmdmPm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        `,
      ],
    },
  },
});
