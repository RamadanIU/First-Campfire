/**
 * Names of villagers (step 2.1, GDD §8.6): made of the syllables of a cultural set
 * (data/names.json) — a root and an ending of the villager's sex: «Рад» + «омир» = Радомир,
 * «Люб» + «ава» = Любава. Names the table skips (they sound badly) are never given.
 *
 * A name is not repeated among the living: the generator draws one of all the names of the set at
 * random and, if it is taken, takes the next free one in the order of the set. Only when every
 * name of the set is worn by someone alive (hundreds of people of one sex) is a name repeated,
 * with a number: «Радомир 2».
 */
import { DATA } from '../data/index.ts';
import type { NameSet } from '../data/tables.ts';
import { intRange, type Rng } from './rng.ts';
import type { Sex } from './villagers.ts';

/** Every name of the set for a sex, in order: roots one by one, each with every ending. */
export function namesOf(set: NameSet, sex: Sex): string[] {
  const endings = sex === 'male' ? set.male : set.female;
  const skip = new Set(set.skip);
  const names: string[] = [];
  for (const root of set.roots) {
    for (const ending of endings) {
      const name = root + ending;
      if (!skip.has(name)) names.push(name);
    }
  }
  return names;
}

/** The set of names of the people of the camp: the first of data/names.json. */
function campSet(): NameSet {
  return DATA.names.records[0]!;
}

/**
 * A name for a newborn or a newcomer of sex `sex`, not worn by anyone in `taken` (the names of
 * the living). Draws one number from `rng`.
 */
export function pickName(
  rng: Rng,
  sex: Sex,
  taken: ReadonlySet<string>,
  set: NameSet = campSet(),
): string {
  const names = namesOf(set, sex);
  const start = intRange(rng, 0, names.length - 1);
  for (let i = 0; i < names.length; i++) {
    const name = names[(start + i) % names.length]!;
    if (!taken.has(name)) return name;
  }
  const base = names[start]!;
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`;
    if (!taken.has(name)) return name;
  }
}
