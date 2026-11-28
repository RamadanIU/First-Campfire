/**
 * The villager's profile (step 2.1) — the criteria of the step as scenarios:
 *   - each has a name (not repeated among the living), an age that goes with the calendar, kin;
 *   - memory takes significant events and leaves the everyday: «ate for the first time» is not
 *     remembered, «nearly died of hunger» is (the rule — src/sim/profile.ts, `memorable`);
 *   - the memory keeps the last `life.memorySize` and survives a save.
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import { TICKS_PER_YEAR } from '../src/sim/calendar.ts';
import { findEvent } from '../src/sim/events.ts';
import { hashState } from '../src/sim/hash.ts';
import { addMemory, ageOf, cameFromOutside } from '../src/sim/profile.ts';
import { loadWorld, saveWorld } from '../src/sim/save.ts';
import { createWorld, runTicks, stepWorld } from '../src/sim/world.ts';
import { stepWarm, worldOn } from './scenario.ts';

const DAY = DATA.balance.time.ticksPerDay;

describe('анкета первой пары', () => {
  it('на зёрнах 1…50: у каждого имя, двое — с разными именами; молодые взрослые без родителей', () => {
    const { min, max } = DATA.balance.life.firstPairAge;
    const names = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const world = createWorld(seed);
      const [man, woman] = world.villagers.list;
      expect(man!.name, `зерно ${seed}`).not.toBe(woman!.name);
      for (const villager of [man!, woman!]) {
        expect(villager.name).toMatch(/^[А-ЯЁ][а-яё]+$/);
        const age = ageOf(villager, world.tick);
        expect(age, `зерно ${seed}: ${villager.name}`).toBeGreaterThanOrEqual(min);
        expect(age).toBeLessThanOrEqual(max);
        expect(villager.born).toBeLessThan(0);
        expect(cameFromOutside(villager)).toBe(true);
        expect([villager.mother, villager.father, villager.spouse]).toEqual([null, null, null]);
        expect(villager.children).toEqual([]);
        expect(villager.birthplace).toEqual({ x: villager.x, y: villager.y });
        names.add(villager.name);
      }
    }
    // Names differ from world to world, not one couple everywhere.
    expect(names.size).toBeGreaterThan(40);
  });

  it('возраст идёт вместе с календарём: через год — на год старше, день рождения у каждого свой', () => {
    const world = createWorld(1);
    const [man, woman] = world.villagers.list;
    const start = [ageOf(man!, 0), ageOf(woman!, 0)];
    // The birthday of each falls somewhere within the first year.
    const birthdays = [man!, woman!].map((v) => TICKS_PER_YEAR - (-v.born % TICKS_PER_YEAR));
    for (const [i, villager] of [man!, woman!].entries()) {
      expect(ageOf(villager, birthdays[i]! - 1)).toBe(start[i]);
      expect(ageOf(villager, birthdays[i]!)).toBe(start[i]! + 1);
    }
    expect(birthdays[0]).not.toBe(birthdays[1]);
    runTicks(world, TICKS_PER_YEAR);
    expect([ageOf(man!, world.tick), ageOf(woman!, world.tick)]).toEqual([
      start[0]! + 1,
      start[1]! + 1,
    ]);
  });

  it('одно зерно — одна анкета; другие системы от имён не сдвинулись (свой поток profiles)', () => {
    const a = createWorld(7);
    const b = createWorld(7);
    expect(a.villagers.list.map((v) => [v.name, v.born])).toEqual(
      b.villagers.list.map((v) => [v.name, v.born]),
    );
    runTicks(a, 3000);
    runTicks(b, 3000);
    expect(hashState(a)).toBe(hashState(b));
  });
});

describe('память жителя: значимое пишем, будничное — нет', () => {
  it('первая запись — приход в мир; за 30 суток ели, пили, спали, носили ветки — в памяти этого нет', () => {
    const world = createWorld(1);
    for (const villager of world.villagers.list) {
      expect(villager.memories).toEqual([{ kind: 'arrived', tick: 0, event: expect.any(Number) }]);
      const cause = findEvent(world, villager.memories[0]!.event);
      expect(cause).toMatchObject({ type: 'villager_arrived', villager: villager.id });
    }
    let ate = 0;
    for (let tick = 0; tick < 30 * DAY; tick++) {
      stepWorld(world);
      for (const v of world.villagers.list) if (v.action.kind === 'eat') ate++;
    }
    // They did eat for the first time (and drank, slept…), yet nothing of it is remembered.
    expect(ate).toBeGreaterThan(0);
    expect(world.events.list.some((e) => e.type === 'food_found')).toBe(true);
    const kinds = world.villagers.list.flatMap((v) => v.memories.map((m) => m.kind));
    expect(kinds.filter((k) => k !== 'arrived' && k !== 'first_fire')).toEqual([]);
    // The first fire is remembered by the one who lit it, and only by it.
    const lit = world.events.list.find((e) => e.type === 'fire_lit' && e.first);
    expect(lit?.type).toBe('fire_lit');
    if (lit?.type !== 'fire_lit') return;
    for (const v of world.villagers.list) {
      expect(v.memories.some((m) => m.kind === 'first_fire')).toBe(v.id === lit.villager);
    }
  });

  it('«чуть не умер от голода» — пишем (с причиной), смерть знакомого — помнят (шаг 2.2: знакомые и родня)', () => {
    // A meadow with a pond and no food: hunger at day 25, health below the line ~28 days later.
    const world = worldOn(
      ['............', '............', '....~~~.....', '....~~~.....', '............'],
      [
        { x: 1, y: 1 },
        { x: 10, y: 4 },
      ],
    );
    const [man, woman] = world.villagers.list;
    // She hungers sooner and dies first (day ≈ 45); he lives to remember it and nearly dies next.
    woman!.needs.food = 20;
    const nearlyDied = () => man!.memories.some((m) => m.kind === 'near_death');
    while (!nearlyDied() && world.tick < 90 * DAY) stepWarm(world);
    expect(world.villagers.list.map((v) => v.id)).toEqual([man!.id]);

    const near = world.events.list.find(
      (e) => e.type === 'villager_nearly_died' && e.villager === woman!.id,
    );
    expect(near).toMatchObject({ need: 'food' });
    // Why: the hunger that began earlier.
    const cause = near?.cause.kind === 'event' ? findEvent(world, near.cause.event) : undefined;
    expect(cause).toMatchObject({ type: 'need_ran_out', villager: woman!.id, need: 'food' });

    expect(man!.memories.map((m) => m.kind)).toEqual(['arrived', 'loss', 'near_death']);
    expect(man!.memories[2]).toMatchObject({ kind: 'near_death', need: 'food' });
    expect(man!.memories[1]).toMatchObject({
      kind: 'loss',
      villager: woman!.id,
      name: woman!.name,
      sex: 'female',
      reason: 'hunger',
    });
    // Health crossed the line once: one memory, not one a tick.
    stepWarm(world);
    expect(
      world.events.list.filter((e) => e.type === 'villager_nearly_died' && e.villager === man!.id),
    ).toHaveLength(1);
  });

  it(`помнит не больше ${DATA.balance.life.memorySize} последних событий; память переживает сохранение`, () => {
    const world = createWorld(3);
    const villager = world.villagers.list[0]!;
    for (let i = 1; i <= 12; i++) addMemory(villager, { kind: 'fainted', tick: i, event: 0 });
    expect(villager.memories).toHaveLength(DATA.balance.life.memorySize);
    expect(villager.memories.at(-1)!.tick).toBe(12);
    expect(villager.memories[0]!.tick).toBe(12 - DATA.balance.life.memorySize + 1);

    const loaded = loadWorld(saveWorld(world));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.world.villagers.list[0]).toMatchObject({
      name: villager.name,
      born: villager.born,
      memories: villager.memories,
    });
  });
});
