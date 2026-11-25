import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.10, GDD §10.6): the weather — snow: a cloud with falling flakes.
 * Drawn on the dark panel at ×2; the dark outline keeps it readable on the map too.
 */

export default defineSprite({
  name: 'hud_snow',
  title: 'Значок: снег',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    w: 'bone.1',
    W: 'bone.2',
    s: 'stone.2',
    F: 'bone.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ............
          ....oooo....
          ...oWWWWo...
          .oooWWWWWoo.
          oWWWWWWwWWWo
          oswwwwwwwwso
          .osssssssso.
          ..oooooooo..
          ..F...F...F.
          ....F...F...
          ..F...F...F.
          ............
          `,
      ],
    },
  },
});
