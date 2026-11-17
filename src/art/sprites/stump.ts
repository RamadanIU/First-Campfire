import { defineSprite } from '../sprite.ts';

/*
 * A stump, 12×10: what is left of a felled tree (GDD §3.2 — the land remembers people). The cut
 * face shows pale wood with growth rings; the bark side is lit from the left.
 */

export default defineSprite({
  name: 'stump',
  title: 'Пень',
  kind: 'object',
  width: 12,
  height: 11,
  anchor: { x: 6, y: 10 },
  legend: {
    o: 'bark.0',
    A: 'bark.0',
    B: 'bark.1',
    C: 'bark.2',
    D: 'bark.3',
    W: 'sand.2',
    S: 'sand.1',
    q: 'sand.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ...oooooo...
          .ooSWWWWSoo.
          oSWWSSSSWWSo
          oSWSWqqWSWSo
          oDSWSSSSWSBo
          oDCSWWWWSBBo
          oDCCSSSSBBBo
          oDCBBBBCBBBo
          oDCBBBBBBBAo
          ADCCBBBCBBAA
          AA.AAAAAA.AA
          `,
      ],
    },
  },
  shadow: { width: 12, height: 3, x: 1 },
});
