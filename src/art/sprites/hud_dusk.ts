import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.6, GDD §10.6). The time of day in the observer's panel: dusk — a red sun going down behind the land.
 * Drawn on the dark panel at ×2; the dark outline keeps it readable on the map too.
 */

export default defineSprite({
  name: 'hud_dusk',
  title: 'Значок: закат',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    O: 'fire.1',
    R: 'fire.0',
    y: 'fire.2',
    h: 'leaf.1',
    H: 'leaf.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ............
          ............
          ............
          ............
          ............
          .yy......yy.
          ....oooo....
          ...oOOOOo...
          ..oOOOORRo..
          hhhhhhhhhhhh
          .HHhHHhHHhH.
          ............
          `,
      ],
    },
  },
});
