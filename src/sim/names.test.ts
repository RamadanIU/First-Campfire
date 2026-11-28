import { describe, expect, it } from 'vitest';
import { DATA } from '../data/index.ts';
import { namesOf, pickName } from './names.ts';
import { createRng } from './rng.ts';

const set = DATA.names.records[0]!;

describe('имена из слогов (шаг 2.1, GDD §8.6)', () => {
  it('имя — корень и окончание своего пола; пропущенных сочетаний нет', () => {
    const male = namesOf(set, 'male');
    const female = namesOf(set, 'female');
    expect(male).toContain('Радомир');
    expect(female).toContain('Любава');
    for (const skipped of set.skip) {
      expect(male).not.toContain(skipped);
      expect(female).not.toContain(skipped);
    }
    // Enough for a big clan: hundreds of names of each sex, none repeated.
    expect(new Set(male).size).toBe(male.length);
    expect(male.length).toBeGreaterThan(100);
    expect(female.length).toBeGreaterThan(100);
  });

  it('не повторяется среди живых: 150 имён подряд — все разные', () => {
    const rng = createRng(5, 'profiles');
    const taken = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const name = pickName(rng, 'male', taken);
      expect(taken.has(name)).toBe(false);
      taken.add(name);
    }
  });

  it('когда заняты все имена — повтор с номером, а не зацикливание', () => {
    const rng = createRng(1, 'profiles');
    const taken = new Set(namesOf(set, 'female'));
    const name = pickName(rng, 'female', taken);
    expect(name).toMatch(/ 2$/);
    expect(taken.has(name)).toBe(false);
  });

  it('одно зерно — одни имена', () => {
    const names = (seed: number) => {
      const rng = createRng(seed, 'profiles');
      return [pickName(rng, 'male', new Set()), pickName(rng, 'female', new Set())];
    };
    expect(names(9)).toEqual(names(9));
  });
});
