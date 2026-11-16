import { defineSprite } from '../sprite.ts';

/*
 * An adult of epoch 0 (GDD §10.3): rawhide tunic with a dark belt and a fringed hem, bare arms
 * and feet. 12×18 with a 6×6 face (GDD §10.1); dark coloured outline, light from the upper left.
 * Breathing: on the exhale the head and shoulders sink one pixel.
 * Skin is drawn with the `skin_light` ramp; other tones are ramp swaps (see `variants`).
 */

const inhale = `
  ....oooo....
  ..oojjhhoo..
  ..ojjjhhHo..
  ..ohKKKkHo..
  ..oKoKkoso..
  ..oKKKkkso..
  ...okKkso...
  ..okGGggfo..
  .oKGGgggfso.
  .oKGgggffso.
  .okGggggfso.
  .oKHHHHHHko.
  ..oGgggffo..
  ..ofgfgfgo..
  ..oKkookso..
  ..oKkookso..
  ..oKkookso..
  ...oo..oo...
`;

/** Rows above the belt one pixel lower (one row of the arms is dropped). */
const exhale = `
  ............
  ....oooo....
  ..oojjhhoo..
  ..ojjjhhHo..
  ..ohKKKkHo..
  ..oKoKkoso..
  ..oKKKkkso..
  ...okKkso...
  ..okGGggfo..
  .oKGGgggfso.
  .oKGgggffso.
  .oKHHHHHHko.
  ..oGgggffo..
  ..ofgfgfgo..
  ..oKkookso..
  ..oKkookso..
  ..oKkookso..
  ...oo..oo...
`;

export default defineSprite({
  name: 'villager',
  title: 'Житель (стоит)',
  kind: 'character',
  width: 12,
  height: 18,
  anchor: { x: 6, y: 18 },
  legend: {
    o: 'ink.0',
    H: 'hair.0',
    h: 'hair.1',
    j: 'hair.2',
    s: 'skin_light.0',
    k: 'skin_light.1',
    K: 'skin_light.2',
    f: 'hide.0',
    g: 'hide.1',
    G: 'hide.2',
  },
  animations: {
    idle: { frames: [inhale, exhale], frameMs: [900, 700] },
  },
  variants: {
    tan: { skin_light: 'skin_tan' },
    dark: { skin_light: 'skin_dark' },
  },
});
