import { defineSprite } from '../sprite.ts';

/*
 * A patch of edible roots (burdock), 14×10 (step 1.10): winter food — a rosette of broad leaves with
 * the top of a fat root showing in the soil. Two states: `whole` — not dug yet, `dug` — a dug hole
 * of dark earth with a few limp leaves left. Roots can be dug in autumn and winter
 * (data/objects.json).
 */

export default defineSprite({
  name: 'roots_patch',
  title: 'Коренья',
  kind: 'object',
  width: 14,
  height: 10,
  anchor: { x: 7, y: 9 },
  legend: {
    o: 'leaf.0',
    s: 'leaf.1',
    m: 'leaf.2',
    l: 'leaf.3',
    h: 'leaf.4',
    n: 'dirt.2',
    d: 'dirt.1',
    D: 'dirt.0',
  },
  animations: {
    whole: {
      frames: [
        `
          ......oo......
          ..oo.ohho.oo..
          .ohhoohlmoohho
          ohllmohlmohlmo
          ohlmmsollsomso
          .ommssoolsssmo
          ..osssddnssso.
          .ooddnnddDdoo.
          ..oDdnddDDoo..
          ...ooooooo....
          `,
      ],
    },
    dug: {
      frames: [
        `
          ..............
          ..............
          ..............
          ....o....o....
          ...ohm..oho...
          ..ossmo.osmo..
          .oDDddDDddDDo.
          oDDDDddDDDDdDo
          .oddnnddnnddo.
          ..oooooooooo..
          `,
      ],
    },
  },
  shadow: { width: 12, height: 3, x: 1 },
});
