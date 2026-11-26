import { composeFrame, defineSprite } from '../sprite.ts';

/*
 * A man of epoch 0 asleep on the ground (step 1.5; 24×12 since ADR-033): lying on his side, head
 * to the left, eyes shut, the fur cape over him as a blanket, bare feet out at the right. Breathing:
 * on the inhale the cape rises a pixel (drawn once more a pixel higher), on the exhale it sinks.
 * The colours and swaps are those of `man`; the anchor is the middle of the body on the ground,
 * where a standing man's feet would be.
 */

const HEAD = `
  ...oooo...
  .ooJJjjoo.
  oJJjjjjjho
  ojjhKKKkho
  ojhKKKKKko
  ojhooKooho
  ojhsKKKsho
  .ohjjssjho
  ..ohjjjho.
  ...oooooo.
`;
const BODY = `
  ..ooooooo.....
  .oddddddco....
  ocddcdddcbo...
  odcdcddccbbo..
  ocdccdcbcbbo..
  obcbcbcbbbbo..
  obcbbbbbboKko.
  obbbbbbbboKkko
  oooooooooooooo
`;
const W = 24;
const H = 12;
const exhale = composeFrame(W, H, [
  { grid: BODY, x: 9, y: 3 },
  { grid: HEAD, y: 2 },
]);
const inhale = composeFrame(W, H, [
  { grid: BODY, x: 9, y: 3 },
  { grid: BODY, x: 9, y: 2 },
  { grid: HEAD, y: 2 },
]);

export default defineSprite({
  name: 'man_asleep',
  title: 'Мужчина спит',
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
    b: 'bark.1',
    c: 'bark.2',
    d: 'bark.3',
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
