import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.6, GDD §10.6). The time of day in the observer's panel: dawn — a pale sun rising over the land, rays up.
 * Drawn on the dark panel at ×2; the dark outline keeps it readable on the map too.
 */

export default defineSprite({
  name: 'hud_dawn',
  title: 'Значок: рассвет',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    Y: 'fire.3',
    y: 'fire.2',
    h: 'leaf.1',
    H: 'leaf.2',
    s: 'water.4',
  },
  animations: {
    idle: {
      frames: [
        `
          ............
          .....ss.....
          .....ss.....
          ............
          .s........s.
          ..s.oooo.s..
          ...oYYYYo...
          ..oYYYYYyo..
          ..oYYYYyyo..
          hhhhhhhhhhhh
          .HHhHHhHHhH.
          ............
          `,
      ],
    },
  },
});
