import { defineSprite } from '../sprite.ts';

/*
 * Hazelnuts, 10×10 — a food resource of epoch 0 (data/resources.json, GDD §5.2): three nuts, one resting on two.
 */

export default defineSprite({
  name: 'nuts',
  title: 'Орехи',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'bark.0',
    x: 'sand.2',
    h: 'dirt.2',
    d: 'dirt.1',
    D: 'dirt.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ..........
          ....ooo...
          ...oxhho..
          ...ohhdo..
          .oooddooo.
          oxhhooxhho
          ohhdoohhdo
          oddDooddDo
          .ooo..ooo.
          `,
      ],
    },
  },
});
