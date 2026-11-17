import { defineSprite } from '../sprite.ts';

/*
 * Bones, 10×10 — a material of epoch 0 (data/resources.json, GDD §5.2): two long bones crossed, for needles, tools and ornaments.
 */

export default defineSprite({
  name: 'bones',
  title: 'Кости',
  kind: 'item',
  width: 10,
  height: 10,
  anchor: { x: 5, y: 9 },
  legend: {
    o: 'ink.0',
    W: 'bone.2',
    w: 'bone.1',
    b: 'bone.0',
  },
  animations: {
    idle: {
      frames: [
        `
          oo......oo
          oWo....oWo
          oWWo..oWbo
          .oWWooWbo.
          ..oWWWbo..
          ..oWbwwo..
          .oWboowwo.
          oWbo..owbo
          obo....obo
          oo......oo
          `,
      ],
    },
  },
});
