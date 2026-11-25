import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.10, GDD §10.6): the weather — rain: a dark cloud with slanting drops.
 * Drawn on the dark panel at ×2; the dark outline keeps it readable on the map too.
 */

export default defineSprite({
  name: 'hud_rain',
  title: 'Значок: дождь',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    w: 'stone.3',
    s: 'stone.2',
    S: 'stone.1',
    b: 'water.3',
    B: 'water.4',
  },
  animations: {
    idle: {
      frames: [
        `
          ............
          ....oooo....
          ...owwwwo...
          .ooowwwwwoo.
          owwwwwwswwwo
          osssssssssso
          .oSSSSSSSSo.
          ..oooooooo..
          ...B..B..B..
          ..b..b..b...
          .b..b..b....
          ............
          `,
      ],
    },
  },
});
