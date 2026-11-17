import { defineSprite } from '../sprite.ts';

/*
 * Brushwood, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): a bundle of thin dry twigs tied with a strip of hide; fuel for the fire.
 */

export default defineSprite({
  name: 'brushwood',
  title: 'Хворост',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'bark.0',
    C: 'bark.2',
    D: 'bark.3',
    h: 'hide.1',
    H: 'hide.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ...oooHoo.
          ..oDCCHCDo
          .oooooHoo.
          oDCCDCHCo.
          .ooooohooo
          ..oCDCHCDo
          ...oooHoo.
          ..........
          ..........
          `,
      ],
    },
  },
});
