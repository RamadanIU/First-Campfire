import { defineSprite } from '../sprite.ts';

/*
 * Grass and reeds, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): a sheaf of dry stalks tied in the middle, seed heads on top.
 */

export default defineSprite({
  name: 'reeds',
  title: 'Трава и тростник',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'hide.0',
    h: 'hide.1',
    H: 'hide.2',
    Y: 'sand.2',
    y: 'sand.1',
    d: 'sand.0',
  },
  animations: {
    idle: {
      frames: [
        `
          .h..h..h..
          .yh.yh.yh.
          .oyYyYyyo.
          ..oyYyYo..
          ...oyYo...
          ...oHHo...
          ...oyyo...
          ..oyYydo..
          .oyydyydo.
          .oo.oo.oo.
          `,
      ],
    },
  },
});
