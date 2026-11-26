import { bendFrames } from '../foliage.ts';
import { defineSprite } from '../sprite.ts';

/*
 * A clump of meadow flowers, 13×9 (bending in the wind, ADR-033): white chamomiles and yellow buttercups on thin stems.
 * Decoration of glades; later — seasonal (GDD §10.5). No shadow: they are too low to cast one.
 */

const STILL = `
  ...W......Y..
  ..WyW....YfY.
  ...Wl..W..Y..
  ....l.WyW.l..
  ..Y.l..Wl.l..
  .YfY.l..l.l..
  ..Ys.l.l..l..
  ...s..ll.l...
  ....ss.lsl...
`;

export default defineSprite({
  name: 'flowers',
  title: 'Цветы',
  kind: 'object',
  width: 13,
  height: 9,
  anchor: { x: 6, y: 9 },
  legend: {
    W: 'bone.2',
    y: 'fire.2',
    Y: 'fire.3',
    f: 'fire.1',
    l: 'leaf.3',
    s: 'leaf.2',
  },
  animations: {
    idle: { frames: bendFrames(STILL, 8, 1), frameMs: [300, 200, 200, 300, 300, 200, 200, 300] },
  },
});
