import { defineSprite } from '../sprite.ts';

/*
 * A woman of epoch 0 (GDD §10.3), 12×18 with a 6×6 face: long hair, a rawhide dress to the
 * knees, a necklace of shells, bare arms and feet. The same animations as `man`: `idle_*` and
 * `walk_*` in four directions; facing left is facing right mirrored with the light moved back to
 * the left. Skin — `skin_light` ramp, hair — `hair_brown`; other tones are ramp swaps.
 */

export default defineSprite({
  name: 'woman',
  title: 'Женщина (эпоха 0)',
  kind: 'character',
  width: 12,
  height: 18,
  anchor: { x: 6, y: 18 },
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
    idle_s: {
      frames: [
        `
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojhKKKkhho.
          .ojKoKkosho.
          .ojKKKkksho.
          .ojhKKkkhho.
          .ojjhKkshho.
          .oKGWwWwgso.
          .oKGGgggfso.
          .oKGggggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ............
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojhKKKkhho.
          .ojKoKkosho.
          .ojKKKkksho.
          .ojhKKkkhho.
          .ojjhKkshho.
          .oKGWwWwgso.
          .oKGGgggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
      ],
      frameMs: [900, 700],
    },
    idle_n: {
      frames: [
        `
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojjjjhhhho.
          .ojjjhhhhho.
          .ojjhhhhhho.
          .ojhhhhhhho.
          .ojhhhhhhho.
          .oKjhhhhhso.
          .oKohhhhoso.
          .oKGggggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ............
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojjjjhhhho.
          .ojjjhhhhho.
          .ojjhhhhhho.
          .ojhhhhhhho.
          .ojhhhhhhho.
          .oKjhhhhhso.
          .oKohhhhoso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
      ],
      frameMs: [900, 700],
    },
    idle_e: {
      frames: [
        `
          ....oooo....
          ...ojjjjho..
          ..ojjjjhhko.
          .ojjjjhkKko.
          .ojjhhkKoKko
          .ojhhhkkkkso
          .ojhhhhksso.
          .ojhhhkkso..
          .ojhGWwGgo..
          .ohoGGKkko..
          ..oGGgKkso..
          ..oGggKkfo..
          ..oGgggffo..
          ..ofgfgfgo..
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ....ooooo...
          `,
        `
          ............
          ....oooo....
          ...ojjjjho..
          ..ojjjjhhko.
          .ojjjjhkKko.
          .ojjhhkKoKko
          .ojhhhkkkkso
          .ojhhhhksso.
          .ojhhhkkso..
          .ojhGWwGgo..
          .ohoGGKkko..
          ..oGggKkfo..
          ..oGgggffo..
          ..ofgfgfgo..
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ....ooooo...
          `,
      ],
      frameMs: [900, 700],
    },
    idle_w: {
      frames: [
        `
          ....oooo....
          ..ohjjjjo...
          .okhhjjjjo..
          .okskhjjjjo.
          oksoskhhjjo.
          oKkkkkhhhjo.
          .oKKkhhhhjo.
          ..oKkkhhhjo.
          ..ogGwWGhjo.
          ..okksGGoho.
          ..oKksgGGo..
          ..ofksggGo..
          ..offgggGo..
          ..ogfgfgfo..
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ...ooooo....
          `,
        `
          ............
          ....oooo....
          ..ohjjjjo...
          .okhhjjjjo..
          .okskhjjjjo.
          oksoskhhjjo.
          oKkkkkhhhjo.
          .oKKkhhhhjo.
          ..oKkkhhhjo.
          ..ogGwWGhjo.
          ..okksGGoho.
          ..ofksggGo..
          ..offgggGo..
          ..ogfgfgfo..
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ...ooooo....
          `,
      ],
      frameMs: [900, 700],
    },
    walk_s: {
      frames: [
        `
          ............
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojhKKKkhho.
          .ojKoKkosho.
          .ojKKKkksho.
          .ojhKKkkhho.
          .ojjhKkshho.
          .oKGWwWwgso.
          .oKGGgggfso.
          .oKGggggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojhKKKkhho.
          .ojKoKkosho.
          .ojKKKkksho.
          .ojhKKkkhho.
          .ojjhKkshho.
          .oKGWwWwgso.
          .oKGGgggfso.
          .oKGggggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ..oKkooooo..
          ...oo.......
          `,
        `
          ............
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojhKKKkhho.
          .ojKoKkosho.
          .ojKKKkksho.
          .ojhKKkkhho.
          .ojjhKkshho.
          .oKGWwWwgso.
          .oKGGgggfso.
          .oKGggggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojhKKKkhho.
          .ojKoKkosho.
          .ojKKKkksho.
          .ojhKKkkhho.
          .ojjhKkshho.
          .oKGWwWwgso.
          .oKGGgggfso.
          .oKGggggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ..oooookso..
          .......oo...
          `,
      ],
      frameMs: 200,
    },
    walk_n: {
      frames: [
        `
          ............
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojjjjhhhho.
          .ojjjhhhhho.
          .ojjhhhhhho.
          .ojhhhhhhho.
          .ojhhhhhhho.
          .oKjhhhhhso.
          .oKohhhhoso.
          .oKGggggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojjjjhhhho.
          .ojjjhhhhho.
          .ojjhhhhhho.
          .ojhhhhhhho.
          .ojhhhhhhho.
          .oKjhhhhhso.
          .oKohhhhoso.
          .oKGggggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ..oKkooooo..
          ...oo.......
          `,
        `
          ............
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojjjjhhhho.
          .ojjjhhhhho.
          .ojjhhhhhho.
          .ojhhhhhhho.
          .ojhhhhhhho.
          .oKjhhhhhso.
          .oKohhhhoso.
          .oKGggggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ....oooo....
          ..oojjjhoo..
          .ojjjjjhhho.
          .ojjjjhhhho.
          .ojjjhhhhho.
          .ojjhhhhhho.
          .ojhhhhhhho.
          .ojhhhhhhho.
          .oKjhhhhhso.
          .oKohhhhoso.
          .oKGggggfso.
          .okGGgggfko.
          ..oGgggfffo.
          ..ofgfgfgfo.
          ..oKkookso..
          ..oKkookso..
          ..oooookso..
          .......oo...
          `,
      ],
      frameMs: 200,
    },
    walk_e: {
      frames: [
        `
          ............
          ....oooo....
          ...ojjjjho..
          ..ojjjjhhko.
          .ojjjjhkKko.
          .ojjhhkKoKko
          .ojhhhkkkkso
          .ojhhhhksso.
          .ojhhhkkso..
          .ojhGWwGgo..
          .ohoGGKkko..
          ..oGGgKkso..
          ..oGggKkfo..
          ..oGgggffo..
          ..ofgfgfgo..
          ...osKKko...
          ..oso.oKko..
          ..ooo..oooo.
          `,
        `
          ....oooo....
          ...ojjjjho..
          ..ojjjjhhko.
          .ojjjjhkKko.
          .ojjhhkKoKko
          .ojhhhkkkkso
          .ojhhhhksso.
          .ojhhhkkso..
          .ojhGWwGgo..
          .ohoGGKkko..
          ..oGGgKkso..
          ..oGggKkfo..
          ..oGgggffo..
          ..ofgfgfgo..
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ....ooooo...
          `,
        `
          ............
          ....oooo....
          ...ojjjjho..
          ..ojjjjhhko.
          .ojjjjhkKko.
          .ojjhhkKoKko
          .ojhhhkkkkso
          .ojhhhhksso.
          .ojhhhkkso..
          .ojhGWwGgo..
          .ohoGGKkko..
          ..oGGgKkso..
          ..oGggKkfo..
          ..oGgggffo..
          ..ofgfgfgo..
          ...oKKsso...
          ..oKko.osso.
          ..ooo..oooo.
          `,
        `
          ....oooo....
          ...ojjjjho..
          ..ojjjjhhko.
          .ojjjjhkKko.
          .ojjhhkKoKko
          .ojhhhkkkkso
          .ojhhhhksso.
          .ojhhhkkso..
          .ojhGWwGgo..
          .ohoGGKkko..
          ..oGGgKkso..
          ..oGggKkfo..
          ..oGgggffo..
          ..ofgfgfgo..
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ....ooooo...
          `,
      ],
      frameMs: 200,
    },
    walk_w: {
      frames: [
        `
          ............
          ....oooo....
          ..ohjjjjo...
          .okhhjjjjo..
          .okskhjjjjo.
          oksoskhhjjo.
          oKkkkkhhhjo.
          .oKKkhhhhjo.
          ..oKkkhhhjo.
          ..ogGwWGhjo.
          ..okksGGoho.
          ..oKksgGGo..
          ..ofksggGo..
          ..offgggGo..
          ..ogfgfgfo..
          ...okssKo...
          ..okso.oKo..
          .oooo..ooo..
          `,
        `
          ....oooo....
          ..ohjjjjo...
          .okhhjjjjo..
          .okskhjjjjo.
          oksoskhhjjo.
          oKkkkkhhhjo.
          .oKKkhhhhjo.
          ..oKkkhhhjo.
          ..ogGwWGhjo.
          ..okksGGoho.
          ..oKksgGGo..
          ..ofksggGo..
          ..offgggGo..
          ..ogfgfgfo..
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ...ooooo....
          `,
        `
          ............
          ....oooo....
          ..ohjjjjo...
          .okhhjjjjo..
          .okskhjjjjo.
          oksoskhhjjo.
          oKkkkkhhhjo.
          .oKKkhhhhjo.
          ..oKkkhhhjo.
          ..ogGwWGhjo.
          ..okksGGoho.
          ..oKksgGGo..
          ..ofksggGo..
          ..offgggGo..
          ..ogfgfgfo..
          ...oKKsso...
          .oKKo.okso..
          .oooo..ooo..
          `,
        `
          ....oooo....
          ..ohjjjjo...
          .okhhjjjjo..
          .okskhjjjjo.
          oksoskhhjjo.
          oKkkkkhhhjo.
          .oKKkhhhhjo.
          ..oKkkhhhjo.
          ..ogGwWGhjo.
          ..okksGGoho.
          ..oKksgGGo..
          ..ofksggGo..
          ..offgggGo..
          ..ogfgfgfo..
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ...ooooo....
          `,
      ],
      frameMs: 200,
    },
  },
  shadow: { width: 8, height: 3, x: 1 },
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
