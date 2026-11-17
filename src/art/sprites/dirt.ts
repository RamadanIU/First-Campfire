import { defineSprite } from '../sprite.ts';

/*
 * Bare earth: trodden ground, later paths and ploughland. No outline. Clods and pebbles are
 * lit from the upper left (light top-left, shade bottom-right) and stay away from the edges.
 */
export default defineSprite({
  name: 'dirt',
  title: 'Земля',
  kind: 'tile',
  width: 16,
  height: 16,
  anchor: { x: 0, y: 0 },
  legend: {
    d: 'dirt.0',
    m: 'dirt.1',
    l: 'dirt.2',
    P: 'stone.3',
  },
  animations: {
    idle: {
      frames: [
        `
        mmmmmmmmmmmmmmmm
        mmmmmmmlmdmmmmmm
        mmmmmmmdmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmldmmmmmmmmmmmm
        mmmmmmldmmdmmmmm
        mmmmmmmmmmmmmmmm
        mmmllmmmmmmmmmmm
        mmmddmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmldmmmllmmmmmm
        mmmmmmmmddmPdmmm
        mmmmmmlmmmmmmmmm
        mmmmmmdmPdmmmmmm
        mmmmmmmmmmmmmmmm
        `,
      ],
    },
  },
});
