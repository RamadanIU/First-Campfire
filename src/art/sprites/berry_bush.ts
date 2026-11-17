import { defineSprite } from '../sprite.ts';

/*
 * A berry bush (raspberry), 16×14. Two states: `ripe` — red berries among the leaves, `empty` —
 * picked clean or out of season (GDD §3.2: a bush bears fruit once a year). Berries are dark red
 * with a shaded underside and a glint on a few.
 */

export default defineSprite({
  name: 'berry_bush',
  title: 'Ягодный куст',
  kind: 'object',
  width: 16,
  height: 14,
  anchor: { x: 8, y: 13 },
  legend: {
    o: 'leaf.0',
    s: 'leaf.1',
    m: 'leaf.2',
    l: 'leaf.3',
    h: 'leaf.4',
    r: 'berry.1',
    R: 'berry.0',
    x: 'bone.2',
  },
  animations: {
    ripe: {
      frames: [
        `
          .......oo.......
          .....oolloo.....
          ....ohhhllmo....
          ...ohrhhlxmmo...
          ..ollRlllRmrso..
          ..olrlllmmsRlo..
          .ohhRmmllsssrmo.
          ohhhllhhllslRmso
          olhllhrhllmllmso
          olllllRllmrsmsso
          ommrmlllmmRssrso
          .osRsmmrmssssRo.
          ..ossssRssssso..
          ...oooossoooo...
          `,
      ],
    },
    empty: {
      frames: [
        `
          .......oo.......
          .....oolloo.....
          ....ohhhllmo....
          ...ohhhhllmmo...
          ..ollllllmmsso..
          ..olmlllmmsslo..
          .ohhsmmllssslmo.
          ohhhllhhllsllmso
          olhllhhhllmllmso
          olllllhllmssmsso
          ommmmlllmmssssso
          .osssmmmmssssso.
          ..osssssssssso..
          ...oooossoooo...
          `,
      ],
    },
  },
  shadow: { width: 14, height: 4, x: 1 },
});
