import { defineSprite } from '../sprite.ts';

/*
 * A hazel bush, 16×14 (step 1.10): winter food — clusters of hazelnuts in their husks among round
 * leaves, on a few bare stems. Two states: «nuts» — with nuts, «empty» — picked clean. Nuts can be
 * gathered in autumn and winter (data/objects.json); in winter the leaves are under snow (the
 * seasonal swap of the leaves, src/art/seasons.ts).
 */

export default defineSprite({
  name: 'hazel',
  title: 'Лещина',
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
    b: 'bark.1',
    x: 'sand.2',
    n: 'dirt.2',
    d: 'dirt.1',
    D: 'dirt.0',
  },
  animations: {
    nuts: {
      frames: [
        `
          .....oo...oo....
          ...oohhoooll....
          ..ohhlllohhlmo..
          .ohllxnlllllmso.
          .ohlxnndhhxnmso.
          ohllndDlllnndsso
          ohlmmmllldDmmsso
          ohhlllhhlmmmssso
          olllxnlhllmllmso
          .omxnndlmmssmso.
          .osmndDmmsssso..
          ..ossmmsbsssso..
          ...oossbbsooo...
          .....oobboo.....
          `,
      ],
    },
    empty: {
      frames: [
        `
          .....oo...oo....
          ...oohhoooll....
          ..ohhlllohhlmo..
          .ohlllmlllllmso.
          .ohllmmmhhlmmso.
          ohllmmslllmmmsso
          ohlmmmlllmsmmsso
          ohhlllhhlmmmssso
          ollllmlhllmllmso
          .omlmmmlmmssmso.
          .osmmmsmmsssso..
          ..ossmmsbsssso..
          ...oossbbsooo...
          .....oobboo.....
          `,
      ],
    },
  },
  shadow: { width: 14, height: 4, x: 1 },
});
