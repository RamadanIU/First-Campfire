import { defineSprite, mirrorFrame, sinkRows } from '../sprite.ts';

/**
 * Sitting on the ground facing right (step 1.9): knees up, hands on the knees — by the fire. The
 * exhale sinks the head and shoulders a pixel; facing left is the mirror with the skin's light kept
 * on the left.
 */
const SIT_E = `
    ............
    ............
    ............
    ............
    ....oooo....
    ...ojjjjho..
    ..ojjjjhhKo.
    ..ojjjhKKKo.
    ..ohhhKKoKKo
    ..ohhhKkkkko
    ...ohjjhhho.
    ..odcdjhho..
    .odcddKKko..
    .odcdKKkkoo.
    .oddcGGkKKKo
    .ofgfggfoKso
    .oGgggffoKso
    ..ooooooooo.
`;
const SIT_W = mirrorFrame(SIT_E, { K: 's' });

/*
 * A man of epoch 0 (GDD §10.3), 12×18 with a 6×6 face: a fur cape over the shoulders, a necklace
 * of teeth, a rawhide loincloth, bare arms and feet; short hair and a beard.
 * Animations in four directions: `idle_*` — breathing (head and shoulders sink a pixel on the
 * exhale), `walk_*` — four frames: stride (body a pixel lower), passing, the other stride, passing;
 * `sit_e`, `sit_w` — sitting by the fire (step 1.9).
 * Light falls from the upper left, so facing left (`*_w`) is not a mirror of facing right: it is
 * mirrored and then the skin's light and shadow are swapped back (docs/ART.md).
 * Skin is drawn with the `skin_light` ramp, hair with `hair_brown`; the other five skin tones and
 * four hair colours are ramp swaps (see `variants`; the game combines them freely).
 */

export default defineSprite({
  name: 'man',
  title: 'Мужчина (эпоха 0)',
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
    b: 'bark.1',
    c: 'bark.2',
    d: 'bark.3',
    w: 'bone.1',
    W: 'bone.2',
  },
  animations: {
    idle_s: {
      frames: [
        `
          ....oooo....
          ..oojjhhoo..
          ..ojjjhhho..
          ..ohKKKkho..
          ..oKoKkoso..
          ..ojKKkkho..
          ..ohjhhhho..
          .ocddddcbbo.
          odcdKWwKcbbo
          odcoKkkkobbo
          .oKokKkkoso.
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
          ..oKkookso..
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ............
          ....oooo....
          ..oojjhhoo..
          ..ojjjhhho..
          ..ohKKKkho..
          ..oKoKkoso..
          ..ojKKkkho..
          ..ohjhhhho..
          .ocddddcbbo.
          odcdKWwKcbbo
          odcoKkkkobbo
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
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
          ..ojjjjhho..
          ..ojjjhhho..
          ..ojjhhhho..
          ..ohjhhhho..
          ...ohhhho...
          .ocddddcbbo.
          odcddccccbbo
          odcdccccbbbo
          .oKodcbcoso.
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
          ..oKkookso..
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ............
          ....oooo....
          ..oojjjhoo..
          ..ojjjjhho..
          ..ojjjhhho..
          ..ojjhhhho..
          ..ohjhhhho..
          ...ohhhho...
          .ocddddcbbo.
          odcddccccbbo
          odcdccccbbbo
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
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
          ..ojjjjhhKo.
          ..ojjjhKKKo.
          ..ohhhKKoKKo
          ..ohhhKkkkko
          ...ohjjhhho.
          ..odcdjhho..
          .odcddKKko..
          .odcdKKkko..
          ..oddoKkko..
          ...ofoKkso..
          ...oGGkkfo..
          ...ofgfgfo..
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ....ooooo...
          `,
        `
          ............
          ....oooo....
          ...ojjjjho..
          ..ojjjjhhKo.
          ..ojjjhKKKo.
          ..ohhhKKoKKo
          ..ohhhKkkkko
          ...ohjjhhho.
          ..odcdjhho..
          .odcddKKko..
          .odcdKKkko..
          ...ofoKkso..
          ...oGGkkfo..
          ...ofgfgfo..
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
          .oshhjjjjo..
          .ossshjjjo..
          ossosshhho..
          okkkkshhho..
          .ohhhjjho...
          ..ohhjdcdo..
          ..okssddcdo.
          ..okkssdcdo.
          ..okksoddo..
          ..oKksofo...
          ..ofkkGGo...
          ..ofgfgfo...
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ...ooooo....
          `,
        `
          ............
          ....oooo....
          ..ohjjjjo...
          .oshhjjjjo..
          .ossshjjjo..
          ossosshhho..
          okkkkshhho..
          .ohhhjjho...
          ..ohhjdcdo..
          ..okssddcdo.
          ..okkssdcdo.
          ..oKksofo...
          ..ofkkGGo...
          ..ofgfgfo...
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
          ..oojjhhoo..
          ..ojjjhhho..
          ..ohKKKkho..
          ..oKoKkoso..
          ..ojKKkkho..
          ..ohjhhhho..
          .ocddddcbbo.
          odcdKWwKcbbo
          odcoKkkkobbo
          .oKokKkkoso.
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ....oooo....
          ..oojjhhoo..
          ..ojjjhhho..
          ..ohKKKkho..
          ..oKoKkoso..
          ..ojKKkkho..
          ..ohjhhhho..
          .ocddddcbbo.
          odcdKWwKcbbo
          odcoKkkkobbo
          .oKokKkkoso.
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
          ..oKkookso..
          ..oKkookso..
          ..oKkooooo..
          ...oo.......
          `,
        `
          ............
          ....oooo....
          ..oojjhhoo..
          ..ojjjhhho..
          ..ohKKKkho..
          ..oKoKkoso..
          ..ojKKkkho..
          ..ohjhhhho..
          .ocddddcbbo.
          odcdKWwKcbbo
          odcoKkkkobbo
          .oKokKkkoso.
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ....oooo....
          ..oojjhhoo..
          ..ojjjhhho..
          ..ohKKKkho..
          ..oKoKkoso..
          ..ojKKkkho..
          ..ohjhhhho..
          .ocddddcbbo.
          odcdKWwKcbbo
          odcoKkkkobbo
          .oKokKkkoso.
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
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
          ..ojjjjhho..
          ..ojjjhhho..
          ..ojjhhhho..
          ..ohjhhhho..
          ...ohhhho...
          .ocddddcbbo.
          odcddccccbbo
          odcdccccbbbo
          .oKodcbcoso.
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ....oooo....
          ..oojjjhoo..
          ..ojjjjhho..
          ..ojjjhhho..
          ..ojjhhhho..
          ..ohjhhhho..
          ...ohhhho...
          .ocddddcbbo.
          odcddccccbbo
          odcdccccbbbo
          .oKodcbcoso.
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
          ..oKkookso..
          ..oKkookso..
          ..oKkooooo..
          ...oo.......
          `,
        `
          ............
          ....oooo....
          ..oojjjhoo..
          ..ojjjjhho..
          ..ojjjhhho..
          ..ojjhhhho..
          ..ohjhhhho..
          ...ohhhho...
          .ocddddcbbo.
          odcddccccbbo
          odcdccccbbbo
          .oKodcbcoso.
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
          ..oKkookso..
          ..oKkookso..
          ...oo..oo...
          `,
        `
          ....oooo....
          ..oojjjhoo..
          ..ojjjjhho..
          ..ojjjhhho..
          ..ojjhhhho..
          ..ohjhhhho..
          ...ohhhho...
          .ocddddcbbo.
          odcddccccbbo
          odcdccccbbbo
          .oKodcbcoso.
          .okGGGggfko.
          ..oGgggffo..
          ..ofgfgfgo..
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
          ..ojjjjhhKo.
          ..ojjjhKKKo.
          ..ohhhKKoKKo
          ..ohhhKkkkko
          ...ohjjhhho.
          ..odcdjhho..
          .odcddKKko..
          .odcdKKkko..
          ..oddoKkko..
          ...ofoKkso..
          ...oGGkkfo..
          ...ofgfgfo..
          ...osKKko...
          ..oso.oKko..
          ..ooo..oooo.
          `,
        `
          ....oooo....
          ...ojjjjho..
          ..ojjjjhhKo.
          ..ojjjhKKKo.
          ..ohhhKKoKKo
          ..ohhhKkkkko
          ...ohjjhhho.
          ..odcdjhho..
          .odcddKKko..
          .odcdKKkko..
          ..oddoKkko..
          ...ofoKkso..
          ...oGGkkfo..
          ...ofgfgfo..
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ....ooooo...
          `,
        `
          ............
          ....oooo....
          ...ojjjjho..
          ..ojjjjhhKo.
          ..ojjjhKKKo.
          ..ohhhKKoKKo
          ..ohhhKkkkko
          ...ohjjhhho.
          ..odcdjhho..
          .odcddKKko..
          .odcdKKkko..
          ..oddoKkko..
          ...ofoKkso..
          ...oGGkkfo..
          ...ofgfgfo..
          ...oKKsso...
          ..oKko.osso.
          ..ooo..oooo.
          `,
        `
          ....oooo....
          ...ojjjjho..
          ..ojjjjhhKo.
          ..ojjjhKKKo.
          ..ohhhKKoKKo
          ..ohhhKkkkko
          ...ohjjhhho.
          ..odcdjhho..
          .odcddKKko..
          .odcdKKkko..
          ..oddoKkko..
          ...ofoKkso..
          ...oGGkkfo..
          ...ofgfgfo..
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
          .oshhjjjjo..
          .ossshjjjo..
          ossosshhho..
          okkkkshhho..
          .ohhhjjho...
          ..ohhjdcdo..
          ..okssddcdo.
          ..okkssdcdo.
          ..okksoddo..
          ..oKksofo...
          ..ofkkGGo...
          ..ofgfgfo...
          ...okssKo...
          ..okso.oKo..
          .oooo..ooo..
          `,
        `
          ....oooo....
          ..ohjjjjo...
          .oshhjjjjo..
          .ossshjjjo..
          ossosshhho..
          okkkkshhho..
          .ohhhjjho...
          ..ohhjdcdo..
          ..okssddcdo.
          ..okkssdcdo.
          ..okksoddo..
          ..oKksofo...
          ..ofkkGGo...
          ..ofgfgfo...
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ...ooooo....
          `,
        `
          ............
          ....oooo....
          ..ohjjjjo...
          .oshhjjjjo..
          .ossshjjjo..
          ossosshhho..
          okkkkshhho..
          .ohhhjjho...
          ..ohhjdcdo..
          ..okssddcdo.
          ..okkssdcdo.
          ..okksoddo..
          ..oKksofo...
          ..ofkkGGo...
          ..ofgfgfo...
          ...oKKsso...
          .oKKo.okso..
          .oooo..ooo..
          `,
        `
          ....oooo....
          ..ohjjjjo...
          .oshhjjjjo..
          .ossshjjjo..
          ossosshhho..
          okkkkshhho..
          .ohhhjjho...
          ..ohhjdcdo..
          ..okssddcdo.
          ..okkssdcdo.
          ..okksoddo..
          ..oKksofo...
          ..ofkkGGo...
          ..ofgfgfo...
          ...oKkkso...
          ...oKkkso...
          ...oKkkso...
          ...ooooo....
          `,
      ],
      frameMs: 200,
    },
    sit_e: { frames: [SIT_E, sinkRows(SIT_E, 4, 12)], frameMs: [900, 700] },
    sit_w: { frames: [SIT_W, sinkRows(SIT_W, 4, 12)], frameMs: [900, 700] },
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
