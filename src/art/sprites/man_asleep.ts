import { defineSprite } from '../sprite.ts';

/*
 * A man of epoch 0 asleep on the ground (step 1.5), 18×9: lying on his side, head to the left,
 * eyes shut, the fur cape over him as a blanket, bare feet out at the right. Two frames — breathing:
 * the cape rises a pixel. The colours and swaps are those of `man`; the anchor is the middle of
 * the body on the ground, where a standing man's feet would be.
 */

export default defineSprite({
  name: 'man_asleep',
  title: 'Мужчина спит',
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
    b: 'bark.1',
    c: 'bark.2',
    d: 'bark.3',
    w: 'bone.1',
    W: 'bone.2',
  },
  animations: {
    idle: {
      frames: [
        `
          ..oooo............
          .ojjhho.oooooo....
          ojjjhhhoocddddcoo.
          ojhKKkhodcddddccbo
          ojKsKksodcdcddcbbo
          .oKKkkoGgdcccccbbo
          .okKkoWwGgggffbbko
          ..oooooooooooKkKko
          .............ooooo
          `,
        `
          ..oooo..oooooo....
          .ojjhhoocddddcoo..
          ojjjhhhodcddddccoo
          ojhKKkhodcddddccbo
          ojKsKksodcdcddcbbo
          .oKKkkoGgdcccccbbo
          .okKkoWwGgggffbbko
          ..oooooooooooKkKko
          .............ooooo
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
