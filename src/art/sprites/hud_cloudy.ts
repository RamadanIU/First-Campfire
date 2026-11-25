import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.10, GDD §10.6): the weather — cloudy: a grey-white cloud.
 * Drawn on the dark panel at ×2; the dark outline keeps it readable on the map too.
 */

export default defineSprite({
  name: 'hud_cloudy',
  title: 'Значок: облачно',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    w: 'bone.1',
    W: 'bone.2',
    s: 'stone.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ............
          ............
          ....oooo....
          ...oWWWWo...
          .oooWWWWWoo.
          oWWWWWWwWWWo
          oWWWWWwwwWWo
          oswwwwwwwwso
          .osssssssso.
          ..oooooooo..
          ............
          ............
          `,
      ],
    },
  },
});
