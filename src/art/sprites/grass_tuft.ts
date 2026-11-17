import { defineSprite } from '../sprite.ts';

/*
 * A tuft of tall grass, 10×9: decoration on meadows and at the edge of the forest. In the wind the
 * tips bend one pixel to the right and back.
 */

export default defineSprite({
  name: 'grass_tuft',
  title: 'Высокая трава',
  kind: 'object',
  width: 10,
  height: 9,
  anchor: { x: 5, y: 9 },
  legend: {
    l: 'grass.3',
    m: 'grass.1',
    s: 'grass.0',
  },
  animations: {
    idle: {
      frames: [
        `
          ..........
          ...l...l..
          ...l..lm..
          .l.ml.m...
          .ml.mlm.l.
          ..m.mmmlm.
          ..ms.mmm..
          ..smsmsm..
          ...sssss..
          `,
        `
          ..........
          ....l...l.
          ....l..lm.
          ..l.ml.m..
          .ml.mlm.l.
          ..ml.mmlm.
          ..ms.mmm..
          ..smsmsm..
          ...sssss..
          `,
      ],
      frameMs: [1200, 600],
    },
  },
});
