import { composeFrame, defineSprite } from '../sprite.ts';

/*
 * A woman of epoch 0 asleep on the ground (step 1.5; 24×12 since ADR-033): lying on her side,
 * head to the left, eyes shut, her long hair spread behind the head, the hide dress with the
 * necklace of shells, bare feet out at the right. Breathing: on the inhale the dress rises a pixel.
 * The colours and swaps are those of `woman`; the anchor is the middle of the body on the ground.
 */

const HEAD = `
  ..oooo....
  .oJJjjoo..
  oJjjjjjhoo
  ojjhKKKkho
  ojhKKKKKko
  ojhooKooho
  ojhsKKKsho
  ojhKKssKho
  ojhhoKKoho
  .ojjhooohjo
  ..oohhhhoo.
`;
const BODY = `
  ..ooooooo.....
  .oGGGGggfo....
  oGGgGgggffo...
  oWwWwggggffo..
  oGGggggggffo..
  oGgggggffffo..
  ofgfgfgffoKko.
  offffffffoKkko
  oooooooooooooo
`;
const W = 24;
const H = 12;
const exhale = composeFrame(W, H, [
  { grid: BODY, x: 9, y: 3 },
  { grid: HEAD, y: 1 },
]);
const inhale = composeFrame(W, H, [
  { grid: BODY, x: 9, y: 3 },
  { grid: BODY, x: 9, y: 2 },
  { grid: HEAD, y: 1 },
]);

export default defineSprite({
  name: 'woman_asleep',
  title: 'Женщина спит',
  kind: 'character',
  width: W,
  height: H,
  anchor: { x: 12, y: 11 },
  legend: {
    o: 'ink.0',
    h: 'hair_brown.0',
    j: 'hair_brown.1',
    J: 'hair_brown.2',
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
    idle: { frames: [exhale, inhale], frameMs: [1100, 900] },
  },
  shadow: { width: 22, height: 4, x: 1, y: -1 },
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
