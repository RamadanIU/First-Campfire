import { defineSprite } from '../sprite.ts';

/*
 * A woman of epoch 0 asleep on the ground (step 1.5), 18×9: lying on her side, head to the left,
 * long hair, eyes shut, the rawhide dress with the necklace of shells, bare feet at the right. Two
 * frames — breathing. The colours and swaps are those of `woman`; the anchor is the middle of the
 * body on the ground.
 */

export default defineSprite({
  name: 'woman_asleep',
  title: 'Женщина спит',
  kind: 'character',
  width: 18,
  height: 9,
  anchor: { x: 9, y: 8 },
  legend: {
    o: 'ink.0',
    h: 'hair_brown.0',
    j: 'hair_brown.1',
    s: 'skin_light.0',
    k: 'skin_light.1',
    K: 'skin_light.2',
    f: 'hide.0',
    g: 'hide.1',
    G: 'hide.2',
    w: 'bone.1',
    W: 'bone.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ..oooo............
          .ojjjhooooooooo...
          ojjjjhhoGGGGgggoo.
          ojjKKkhoGgGgggggfo
          ojKsKksoWwWwgggffo
          ojjKKkkoGGgggggffo
          .ohkKkooGgggggfKko
          ..oooo.ooooooKkkko
          .............oooo.
          `,
        `
          ..oooo.ooooooo....
          .ojjjhooGGGGggooo.
          ojjjjhhoGGGgggggoo
          ojjKKkhoGgGgggggfo
          ojKsKksoWwWwgggffo
          ojjKKkkoGGgggggffo
          .ohkKkooGgggggfKko
          ..oooo.ooooooKkkko
          .............oooo.
          `,
      ],
      frameMs: 900,
    },
  },
  shadow: { width: 16, height: 3, x: 1, y: -1 },
  variants: {
    skin_pale: { skin_light: 'skin_pale' },
    skin_tan: { skin_light: 'skin_tan' },
    skin_olive: { skin_light: 'skin_olive' },
    skin_brown: { skin_light: 'skin_brown' },
    skin_dark: { skin_light: 'skin_dark' },
    hair_black: { hair_brown: 'hair_black' },
    hair_chestnut: { hair_brown: 'hair_chestnut' },
    hair_red: { hair_brown: 'hair_red' },
    hair_blond: { hair_brown: 'hair_blond' },
  },
});
