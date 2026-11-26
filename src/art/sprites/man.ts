import {
  PERSON_ANCHOR,
  PERSON_HEIGHT,
  PERSON_WIDTH,
  type PersonParts,
  personAnimations,
} from '../people.ts';
import { defineSprite } from '../sprite.ts';

/*
 * A man of epoch 0 (GDD §10.3), 16×24 (ADR-033): shaggy hair and a beard, a fur cape over the
 * shoulders, a necklace of teeth, a rawhide loincloth, bare arms and feet. Only the parts are drawn
 * here — head, body and cape from the front, the back and in profile; ../people.ts builds every
 * animation from them (standing with breath, blink and glance; an eight-frame walk; sitting;
 * holding and carrying a load overhead) in four directions.
 * Skin is the `skin_light` ramp, hair `hair_brown` (with a highlight); the other five skin tones and
 * four hair colours are ramp swaps (`variants`; the game combines them freely).
 */

const parts: PersonParts = {
  headS: `
    ......oooo......
    ....ooJJjjoo....
    ...oJJJjjjjho...
    ..oJJjjjjjjhho..
    ..ojjhjjjhjjho..
    ..ohhKKjKKKhho..
    ..ohhKeKKekhho..
    ..ohhKoKkokhho..
    ..ohhsKKkkshho..
    ...ohjjssjjho...
    ....ohjjjjho....
  `,
  glanceS: `
    ..ohhKKeKKehho..
    ..ohhKKoKkohho..
  `,
  headN: `
    ......oooo......
    ....ooJJjjoo....
    ...oJJJjjjjho...
    ..oJJjjjjjjhho..
    ..oJjjjjhjjjho..
    ..ojJjjjhjjhho..
    ..ohjjjjjjjhho..
    ..ohjjhjjjhhho..
    ..ohhjhjjjjhho..
    ...ohhjjhjhho...
    ....ohhhhhho....
  `,
  headE: `
    ......oooo......
    ....ooJJjjoo....
    ...oJJJjjjjjo...
    ..oJJjjjjjjjho..
    ..ojjjjhjjjhKo..
    ..ohjjjhhKKKKo..
    ..ohjjhhsKKeKo..
    ..ohjjhhsKKoKKo.
    ..ohhjhjjKKkso..
    ...ohhjjjjjjso..
    ....ohjjjjjo....
  `,
  torsoS: `
    .....oKkkso.....
    ..ocdddddccbbo..
    .oddcbKWwWkbcbo.
    .ocdoKkWwksobco.
    ..c.oKkkkkso.b..
    ....okKkkkso....
    ....oGGgggfo....
    ....oGggggfo....
    ......gfgf......
  `,
  torsoN: `
    .....okkkko.....
    ..ocdddddccbbo..
    .odddcddcccbbbo.
    .ocdcdcdccbcbco.
    ..c.obcbcbbo.b..
    ....okkkkkso....
    ....oGGgggfo....
    ....oGggggfo....
    ......gfgf......
  `,
  bodyE: `
    .......oKso.....
    ......oKkkso....
    .....oKkkkkso...
    .....oKkkkkso...
    .....okKkkkso...
    .....oGGggfo....
    .....oGGgggfo...
    .....oGgfgffo...
    ......ogfgfo....
  `,
  shoulderE: `
    .....ocddcbo....
    ....ocdddccbo...
    ...obcbdcbcbo...
    ...o.oo.oo.o....
  `,
  limbEdge: 's',
  mirrorSwap: { J: 'h', G: 'f', d: 'b', W: 'w' },
  hairShades: 'Jjh',
  yawnS: {
    grid: `
      ..ohhsKookshho..
      ...ohjjoojjho...
    `,
    y: 8,
  },
  yawnE: {
    grid: `
      ..ohhjhjjKKkoo..
      ...ohhjjjjjjoo..
    `,
    y: 8,
  },
};

export default defineSprite({
  name: 'man',
  title: 'Мужчина (эпоха 0)',
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
    b: 'bark.1',
    c: 'bark.2',
    d: 'bark.3',
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
