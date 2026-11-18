import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.6, GDD §10.6). Death in the event feed: a skull of bone with dark eyes.
 * Drawn on the dark panel at ×2; the dark outline keeps it readable on the map too.
 */

export default defineSprite({
  name: 'hud_death',
  title: 'Значок: смерть',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
  },
  animations: {
    idle: {
      frames: [
        `
          ............
          ...oooooo...
          ..oWWWWWWo..
          .oWWWWWWWwo.
          .oWWWWWWWwo.
          .oWooWWoowo.
          .oWooWWoowo.
          .oWWWooWWwo.
          ..oWWWWWwo..
          ...oWoWowo..
          ...oooooo...
          ............
          `,
      ],
    },
  },
});
