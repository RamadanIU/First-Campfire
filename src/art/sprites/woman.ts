import {
  PERSON_ANCHOR,
  PERSON_HEIGHT,
  PERSON_WIDTH,
  type PersonParts,
  personAnimations,
} from '../people.ts';
import { defineSprite } from '../sprite.ts';

/*
 * A woman of epoch 0 (GDD §10.3), 16×24 (ADR-033): long hair with locks over the shoulders, a
 * hide dress to the knees with a thong belt, a necklace of shells, bare arms and feet. Only the
 * parts are drawn here — head, body, skirt (it sways with the steps) and the hair down the back;
 * ../people.ts builds every animation from them in four directions.
 * Skin is the `skin_light` ramp, hair `hair_brown` (with a highlight); the other five skin tones and
 * four hair colours are ramp swaps (`variants`; the game combines them freely).
 */

const parts: PersonParts = {
  headS: `
    ......oooo......
    ....ooJJjjoo....
    ...oJJJjjjjho...
    ..oJJjjjjjjhho..
    ..ojjjjhhjjjho..
    ..ojhKKKKKkhjo..
    ..ojhoeKKeohjo..
    ..ojhKoKkokhjo..
    ..ojhsKKkkshjo..
    ..ojjoKsskojjo..
    ..oJjjossojjho..
    ..ojjo....ojho..
    ..ojho....ohho..
    ...oo......oo...
  `,
  glanceS: `
    ..ojhKoeKKeojo..
    ..ojhKKoKkohjo..
  `,
  headN: `
    ......oooo......
    ....ooJJjjoo....
    ...oJJJjjjjho...
    ..oJJjjjjjjhho..
    ..oJJjjjjjjjho..
    ..oJjjjjhjjhho..
    ..ojJjjjhjjjho..
    ..ojJjjjhjjjho..
    ..ohjjjjjjjhho..
    ..ohjjhjjjhjho..
    ..ohjjhjjjhjho..
    ..ohjjhjjjhjho..
    ...ohjjjjjjho...
    ...ohjjjhjjho...
    ....ohjjhjho....
    .....ohhhho.....
  `,
  headE: `
    ......oooo......
    ....ooJJjjoo....
    ...oJJJjjjjjo...
    ..oJJjjjjjjjho..
    ..ojjjjhjjjjKo..
    ..ohjjjhhKKKKo..
    ..ohjjjhoKKeKo..
    ..ohjjjhsKKoKKo.
    ..ohjjjhKKKkso..
    ..ohjjjhoKsko...
    ..ohjjjhoooo....
  `,
  backE: {
    grid: `
      ..ohjjho........
      ..ohjhjo........
      ..ohjjjo........
      ...ohjho........
      ...ohho.........
      ....oo..........
    `,
    y: 11,
  },
  torsoS: `
    .....oKkkso.....
    ...ooGGgggfoo...
    ..oGGgWwWwgffo..
    ....oGgwWgfo....
    ....oGggggfo....
    ....offffffo....
  `,
  torsoN: `
    .....okkkko.....
    ...ooGGgggfoo...
    ..oGGggggggffo..
    ....oGggggfo....
    ....oGggggfo....
    ....offffffo....
  `,
  bodyE: `
    .......oKso.....
    ......oGGgfo....
    .....oGGwWgfo...
    ....oGGggggffo..
    ....oGgggggffo..
    .....offfffo....
  `,
  skirt: {
    s: `
      ...oGGgggggfo...
      ...oGgggggffo...
      ..oGgfgfgfgffo..
    `,
    n: `
      ...oGGgggggfo...
      ...oGgggggffo...
      ..oGgfgfgfgffo..
    `,
    e: `
      ....oGGggggfo...
      ...oGGgggggffo..
      ...ogfgfgfgfgo..
    `,
    y: 16,
  },
  lapE: {
    grid: `
      ..........ooo...
      .........oGggo..
      ........oGggfo..
      .......oGgggfo..
      .....ooGggfgo...
      .....oGgfgfgo...
    `,
    y: 17,
  },
  limbEdge: 'f',
  mirrorSwap: { J: 'h', G: 'f', W: 'w' },
  hairShades: 'Jjh',
};

export default defineSprite({
  name: 'woman',
  title: 'Женщина (эпоха 0)',
  kind: 'character',
  width: PERSON_WIDTH,
  height: PERSON_HEIGHT,
  anchor: PERSON_ANCHOR,
  legend: {
    o: 'ink.0',
    e: 'ink.0',
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
  animations: personAnimations(parts),
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
  shadow: { width: 12, height: 4, x: 1 },
});
