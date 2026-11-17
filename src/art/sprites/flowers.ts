import { defineSprite } from '../sprite.ts';

/*
 * A clump of meadow flowers, 11×9: white chamomiles and yellow buttercups on thin stems.
 * Decoration of glades; later — seasonal (GDD §10.5). No shadow: they are too low to cast one.
 */

export default defineSprite({
  name: 'flowers',
  title: 'Цветы',
  kind: 'object',
  width: 11,
  height: 9,
  anchor: { x: 5, y: 9 },
  legend: {
    W: 'bone.2',
    y: 'fire.2',
    Y: 'fire.3',
    f: 'fire.1',
    l: 'leaf.3',
    s: 'leaf.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ..W......Y.
          .WyW....YfY
          ..Wl..W..Y.
          ...l.WyW.l.
          .Y.l..Wl.l.
          YfY.l..l.l.
          .Ys.l.l..l.
          ..s..ll.l..
          ...ss.lsl..
          `,
      ],
    },
  },
});
