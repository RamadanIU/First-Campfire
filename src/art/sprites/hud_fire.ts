import { defineSprite } from '../sprite.ts';

/*
 * An icon of the observer's panel, 12×12 (step 1.9, GDD §10.6). A fire lit in the event feed: a
 * flame over two crossed logs. Drawn on the dark panel at ×2; the dark outline keeps it readable.
 */

export default defineSprite({
  name: 'hud_fire',
  title: 'Значок: костёр разведён',
  kind: 'icon',
  width: 12,
  height: 12,
  anchor: { x: 6, y: 12 },
  legend: {
    o: 'ink.0',
    r: 'fire.0',
    O: 'fire.1',
    Y: 'fire.2',
    W: 'fire.3',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
  },
  animations: {
    idle: {
      frames: [
        `
          .....o......
          ....oro.....
          ....oOro....
          ...orOOro...
          ...oOYYOo...
          ..orOYWYOo..
          ..oOYWWYOo..
          ..oOYWWYOo..
          .ooDoYYoCoo.
          oDDCCooCCBBo
          oCCooBBooCBo
          .oo......oo.
          `,
      ],
    },
  },
});
