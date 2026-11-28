/**
 * Relations and talks (step 2.2) — the criteria of the step as scenarios:
 *   - two who live side by side grow closer (talks, evenings at the fire, work); two who never meet
 *     do not (they are not even acquainted);
 *   - talks are seen (two stand facing each other or talk sitting at the fire, in turns) and do not
 *     get in the way of survival — that is also tests/needs.test.ts, tests/sleep.test.ts and the runs;
 *   - a talk shares what each one saw (food, the land);
 *   - a death is remembered by the kin and the acquaintances only.
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import { emit } from '../src/sim/events.ts';
import { FULL } from '../src/sim/needs.ts';
import { recallTick } from '../src/sim/profile.ts';
import {
  acquaintancesOf,
  changeRelation,
  forget,
  isSeated,
  isSpeaking,
  knows,
  meet,
  RELATION_MAX,
  relationOf,
} from '../src/sim/social.ts';
import type { Villager } from '../src/sim/villagers.ts';
import { createWorld, runTicks, stepWorld, type World } from '../src/sim/world.ts';
import { brokenRules, knowAll, meadow, plenty, runWarm, worldOn } from './scenario.ts';

const DAY = DATA.balance.time.ticksPerDay;

function talks(world: World) {
  return world.events.list.filter((e) => e.type === 'villagers_talked');
}

describe('отношения знакомых: число −100…+100 и химия пары', () => {
  it('хранятся только для знакомых, по паре, отсортированы; химия — постоянная −1…+1', () => {
    const world = createWorld(1);
    world.relations = [];
    meet(world, 5, 2);
    meet(world, 1, 9);
    meet(world, 2, 3);
    meet(world, 2, 5);
    expect(world.relations.map((r) => [r.a, r.b])).toEqual([
      [1, 9],
      [2, 3],
      [2, 5],
    ]);
    const pair = relationOf(world, 5, 2)!;
    expect(pair).toBe(relationOf(world, 2, 5));
    expect(pair.value).toBe(0);
    expect(pair.chemistry).toBeGreaterThanOrEqual(-1);
    expect(pair.chemistry).toBeLessThanOrEqual(1);
    const chemistry = pair.chemistry;
    changeRelation(world, 2, 5, 10);
    expect(relationOf(world, 2, 5)!.chemistry).toBe(chemistry);
    expect(knows(world, 3, 2)).toBe(true);
    expect(knows(world, 3, 5)).toBe(false);
    expect(knows(world, 2, 2)).toBe(false);
    expect(acquaintancesOf(world, 2)).toEqual([
      { id: 5, value: 10 },
      { id: 3, value: 0 },
    ]);
    forget(world, 2);
    expect(world.relations.map((r) => [r.a, r.b])).toEqual([[1, 9]]);
  });

  it('у края меняются меньше и не выходят за ±100', () => {
    const world = createWorld(1);
    world.relations = [];
    changeRelation(world, 1, 2, 10);
    expect(relationOf(world, 1, 2)!.value).toBe(10);
    changeRelation(world, 1, 2, 10);
    expect(relationOf(world, 1, 2)!.value).toBeCloseTo(19, 9);
    for (let i = 0; i < 1000; i++) changeRelation(world, 1, 2, 50);
    expect(relationOf(world, 1, 2)!.value).toBeLessThanOrEqual(RELATION_MAX);
    for (let i = 0; i < 1000; i++) changeRelation(world, 1, 2, -80);
    expect(relationOf(world, 1, 2)!.value).toBeGreaterThanOrEqual(-RELATION_MAX);
  });
});

describe('критерий: у живущих рядом отношения растут, у изолированных — нет', () => {
  it('зёрна 1…10: за 12 суток двое знакомятся, разговаривают и сближаются; к 24-м — ещё ближе', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const world = createWorld(seed);
      runTicks(world, 12 * DAY);
      const year = relationOf(world, 1, 2);
      expect(year, `зерно ${seed}: знакомы`).toBeDefined();
      expect(talks(world).length, `зерно ${seed}: разговоры`).toBeGreaterThanOrEqual(3);
      expect(year!.value, `зерно ${seed}: сблизились`).toBeGreaterThan(10);
      const first = year!.value;
      runTicks(world, 12 * DAY);
      expect(relationOf(world, 1, 2)!.value, `зерно ${seed}: ещё ближе`).toBeGreaterThan(first);
      expect(world.villagers.list, `зерно ${seed}: живы оба`).toHaveLength(2);
    }
  }, 60_000);

  it('двое по разные стороны глубокой воды, не видя друг друга, за 8 суток не сближаются — даже не знакомы', () => {
    // A wide river of deep water; each has its own pond and lives far from the other.
    const rows = meadow(44, 12).map((row, y) => {
      const chars = row.split('');
      for (let x = 19; x <= 24; x++) chars[x] = '=';
      if (y === 5) chars[2] = '~';
      if (y === 5) chars[41] = '~';
      return chars.join('');
    });
    const world = worldOn(rows, [
      { x: 3, y: 6 },
      { x: 40, y: 6 },
    ]);
    let lowest = FULL;
    for (let tick = 0; tick < 8 * DAY; tick++) {
      runWarm(world, 1);
      for (const v of world.villagers.list) lowest = Math.min(lowest, v.needs.social);
    }
    expect(world.villagers.list).toHaveLength(2);
    expect(relationOf(world, 1, 2)).toBeUndefined();
    expect(talks(world)).toEqual([]);
    // Alone, they long for company (GDD §4.2): the need of it fell to zero.
    expect(lowest).toBe(0);
  });
});

describe('разговор виден на экране', () => {
  it('стоя: двое рядом лицом друг к другу, говорят по очереди; разговор — событие с причиной', () => {
    const world = worldOn(meadow(16, 10), [
      { x: 3, y: 5 },
      { x: 9, y: 5 },
    ]);
    for (const v of world.villagers.list) v.needs.social = 10;
    let seen: [Villager, Villager] | null = null;
    const turns = new Set<string>();
    for (let tick = 0; tick < 2 * DAY && !seen; tick++) {
      runWarm(world, 1);
      const [a, b] = world.villagers.list as [Villager, Villager];
      if (a.action.kind === 'talk' && b.action.kind === 'talk') {
        seen = [a, b];
        for (let t = 0; t < 4 * DATA.balance.social.turnTicks; t++) {
          turns.add(`${isSpeaking(a, world.tick + t)}/${isSpeaking(b, world.tick + t)}`);
        }
      }
      expect(brokenRules(world)).toEqual([]);
    }
    expect(seen, 'заговорили').not.toBeNull();
    const [a, b] = seen!;
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    expect(isSeated(a) || isSeated(b)).toBe(false);
    // Facing each other.
    const opposite = { e: 'w', w: 'e', n: 's', s: 'n' } as const;
    expect(b.facing).toBe(opposite[a.facing]);
    // One speaks, then the other — never both at once, never neither.
    expect([...turns].sort()).toEqual(['false/true', 'true/false']);
    const event = talks(world).at(-1)!;
    expect(event.cause).toMatchObject({ kind: 'decision', activity: 'talk' });
    expect([event.villager, event.other].sort()).toEqual([1, 2]);
    // The talk filled the need of company of both.
    runWarm(world, DATA.balance.social.talkTicks.max + 1);
    for (const v of world.villagers.list) expect(v.needs.social).toBeGreaterThan(30);
  });

  it('у костра: двое сидят и беседуют, не вставая', () => {
    let found = false;
    for (let seed = 1; seed <= 5 && !found; seed++) {
      const world = createWorld(seed);
      for (let tick = 0; tick < 12 * DAY && !found; tick++) {
        stepWorld(world);
        const list = world.villagers.list;
        if (list.every((v) => v.action.kind === 'talk' && v.action.seated)) {
          found = true;
          for (const v of list) {
            expect(isSeated(v)).toBe(true);
            const dx = world.camp.x - v.x;
            const dy = world.camp.y - v.y;
            expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeLessThanOrEqual(
              DATA.balance.fire.nearTiles,
            );
          }
        }
      }
    }
    expect(found).toBe(true);
  });
});

describe('разговор делится памятью', () => {
  it('знавший о ягодах рассказал — теперь знают оба', () => {
    const rows = meadow(30, 10);
    rows[1] = `${'.'.repeat(27)}B..`;
    const world = worldOn(rows, [
      { x: 3, y: 5 },
      { x: 6, y: 5 },
    ]);
    plenty(world);
    const [man, woman] = world.villagers.list as [Villager, Villager];
    knowAll(world);
    woman.foods = [];
    woman.seen.fill(0);
    for (const v of world.villagers.list) v.needs.social = 10;
    for (let tick = 0; tick < DAY && talks(world).length === 0; tick++) runWarm(world, 1);
    expect(talks(world)).toHaveLength(1);
    expect(woman.foods.map((k) => k.object)).toEqual(man.foods.map((k) => k.object));
    expect(woman.foods.length).toBeGreaterThan(0);
  });
});

describe('смерть помнят родня и знакомые', () => {
  it('умер знакомый одного — помнит он, а не незнакомая; связи умершего забыты', () => {
    const world = createWorld(1);
    const [man, woman] = world.villagers.list as [Villager, Villager];
    world.relations = [];
    meet(world, man.id, 99);
    world.tick += 1;
    emit(
      world,
      {
        type: 'villager_died',
        villager: 99,
        name: 'Мир',
        sex: 'male',
        x: 0,
        y: 0,
        reason: 'hunger',
        foodReachable: false,
        waterReachable: false,
        warmReachable: false,
      },
      { kind: 'rule', rule: 'genesis' },
    );
    recallTick(world);
    expect(man.memories.at(-1)).toMatchObject({ kind: 'loss', villager: 99, name: 'Мир' });
    expect(woman.memories.some((m) => m.kind === 'loss')).toBe(false);
    expect(knows(world, man.id, 99)).toBe(false);
  });

  it('родственника помнят и без знакомства', () => {
    const world = createWorld(1);
    const [man, woman] = world.villagers.list as [Villager, Villager];
    world.relations = [];
    woman.mother = 77;
    world.tick += 1;
    emit(
      world,
      {
        type: 'villager_died',
        villager: 77,
        name: 'Мила',
        sex: 'female',
        x: 0,
        y: 0,
        reason: 'cold',
        foodReachable: true,
        waterReachable: true,
        warmReachable: false,
      },
      { kind: 'rule', rule: 'genesis' },
    );
    recallTick(world);
    expect(woman.memories.at(-1)).toMatchObject({ kind: 'loss', villager: 77 });
    expect(man.memories.some((m) => m.kind === 'loss')).toBe(false);
  });
});
