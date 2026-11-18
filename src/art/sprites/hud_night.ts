import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.6, GDD §10.6). The time of day in the observer's panel: night — a crescent moon and stars.
 * Drawn on the dark panel at ×2; the dark outline keeps it readable on the map too.
 */

export default defineSprite({
  name: 'hud_night',
  title: 'Значок: ночь',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    Y: 'fire.3',
  },
  animations: {
    idle: {
      frames: [
        `
          ............
          ....oooo..Y.
          ...oWWwo....
          ..oWWwo.....
          ..oWWo......
          ..oWWo....Y.
          ..oWWo......
          ..oWWwo.....
          ...oWWwo.Y..
          ....oooo....
          ............
          ............
          `,
      ],
    },
  },
});
