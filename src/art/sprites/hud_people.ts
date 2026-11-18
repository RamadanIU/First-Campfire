import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.6, GDD §10.6). Population in the observer's panel and people arriving in the event feed: two figures side by side.
 * Drawn on the dark panel at ×2; the dark outline keeps it readable on the map too.
 */

export default defineSprite({
  name: 'hud_people',
  title: 'Значок: жители',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    S: 'skin_light.1',
    s: 'skin_light.0',
    B: 'hide.1',
    b: 'hide.0',
    C: 'berry.1',
    c: 'berry.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ............
          ..oo....oo..
          .oSSo..oSSo.
          .oSso..oSso.
          ..oo....oo..
          .oBBo..oCCo.
          oBBBboocCCCo
          oBBBboocCCCo
          .oBbo..ocCo.
          .oBo....oCo.
          .oBo....oCo.
          .oo......oo.
          `,
      ],
    },
  },
});
