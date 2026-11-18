import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.6, GDD §10.6). The time of day in the observer's panel: day — the sun high, with rays.
 * Drawn on the dark panel at ×2; the dark outline keeps it readable on the map too.
 */

export default defineSprite({
  name: 'hud_day',
  title: 'Значок: день',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    Y: 'fire.3',
    y: 'fire.2',
  },
  animations: {
    idle: {
      frames: [
        `
          .....yy.....
          .y........y.
          ..y..oo..y..
          ....oYYo....
          ...oYYYYo...
          y.oYYYYYyo.y
          y.oYYYYyyo.y
          ...oYYyyo...
          ....oyyo....
          ..y..oo..y..
          .y........y.
          .....yy.....
          `,
      ],
    },
  },
});
