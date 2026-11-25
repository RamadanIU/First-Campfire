import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.9, GDD §10.6). A fire gone out in the event feed:
 * dead crossed logs, a last red ember and a grey wisp of smoke over them. Drawn on the dark panel
 * at ×2; the dark outline keeps it readable.
 */

export default defineSprite({
  name: 'hud_fire_out',
  title: 'Значок: костёр погас',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    r: 'fire.0',
    s: 'stone.1',
    S: 'stone.2',
    T: 'stone.3',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
  },
  animations: {
    idle: {
      frames: [
        `
          ......oo....
          .....oTo....
          ....oTo.....
          ....oSo.....
          .....oSo....
          ......oso...
          .....oso....
          .....oo.....
          .ooDoooooCoo
          oDDCCorCCBBo
          oCCooBBooCBo
          .oo......oo.
          `,
      ],
    },
  },
});
