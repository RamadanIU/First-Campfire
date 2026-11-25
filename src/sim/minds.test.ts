import { describe, expect, it } from 'vitest';
import { worldOn } from '../../tests/scenario.ts';
import { DATA } from '../data/index.ts';
import { look } from './memory.ts';
import {
  availability,
  type Considered,
  canUse,
  choose,
  type Decision,
  fillTicks,
  holdOf,
  reachFor,
  reconsider,
  remember,
  searchSource,
  sleepWish,
  woodNeed,
} from './minds.ts';
import { objectAt, takeFood } from './objects.ts';

describe('доступность и предел поиска', () => {
  it('1 у самого источника, ½ на пути в 60 тайлов, дальше — меньше', () => {
    expect(availability(0)).toBe(1);
    expect(availability(60)).toBe(0.5);
    expect(availability(180)).toBe(0.25);
  });

  it('reachFor — дальше этого источник уже не перевесит лучший вариант', () => {
    const ceiling = 0.36;
    const best = 0.15;
    const reach = reachFor(ceiling, best);
    expect(ceiling * availability(reach)).toBeCloseTo(best, 12);
    expect(ceiling * availability(reach - 1)).toBeGreaterThan(best);
  });

  it('сколько тиков наедаться: от 50 до 100 — 5 горстей по 15 тиков', () => {
    const world = worldOn(['....', '....']);
    const villager = world.villagers.list[0]!;
    villager.needs.food = 50;
    expect(fillTicks('food', villager)).toBe(75);
    villager.needs.water = 70;
    expect(fillTicks('water', villager)).toBe(15);
  });
});

describe('источник', () => {
  const ROWS = ['.....', '..B..', '.....', '~~~~~'];

  it('куст годится, пока на нём есть ягоды и житель стоит сбоку от него', () => {
    const world = worldOn(ROWS);
    const bush = objectAt(world.map, world.objects, 2, 1)!;
    const source = { kind: 'bush', object: bush.id, x: 2, y: 1 } as const;
    expect(canUse(world, source, 2, 0)).toBe(true);
    expect(canUse(world, source, 1, 0)).toBe(false); // a corner, not a side
    takeFood(bush, 4);
    expect(canUse(world, source, 2, 0)).toBe(false);
    expect(canUse(world, { kind: 'water', x: 0, y: 3 }, 0, 2)).toBe(true);
  });

  it('поиск: нашёл, «нигде» (ягод нет совсем) и «далеко» (за пределом пользы)', () => {
    const world = worldOn(ROWS, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
    const villager = world.villagers.list[0]!;
    // The nearest side of the bush is (1, 1): one diagonal step.
    const found = searchSource(world, villager, 'food');
    expect(found).toMatchObject({ ok: true, goal: { x: 1, y: 1 }, source: { x: 2, y: 1 } });
    expect(found.ok && found.cost).toBeCloseTo(Math.SQRT2, 12);
    expect(searchSource(world, villager, 'food', { maxCost: 0.5 })).toEqual({
      ok: false,
      reason: 'too_far',
    });
    takeFood(objectAt(world.map, world.objects, 2, 1)!, 4);
    // He sees it picked bare (step 1.11b: he goes only to food he believes is there).
    look(world, villager);
    expect(searchSource(world, villager, 'food')).toEqual({ ok: false, reason: 'nowhere' });
  });

  it('искал в пустоту — какое-то время не ищет снова', () => {
    const world = worldOn(['.....', '.....', '~~~~~']);
    const villager = world.villagers.list[0]!;
    villager.needs.food = 10;
    world.tick = 5; // the world thinks from tick 1 on (0 is creation)
    expect(choose(world, villager).kind).toBe('rest');
    expect(villager.nowhere.food).toBe(world.tick);
    world.tick += 1;
    const considered: Parameters<typeof choose>[2] = [];
    choose(world, villager, considered);
    expect(considered.find((option) => option.kind === 'eat')).toMatchObject({
      searched: false,
      nowhere: true,
    });
  });
});

describe('упрямство: начатое бросают только ради заметно лучшего (шаг 1.8)', () => {
  const { keepMargin, sleepHold, haulUtility, logSize } = DATA.balance.ai;
  const ROWS = ['......', '....B.', '......', '~~~~~~'];

  it('держится: работа и еда — оценкой при выборе (или нуждой сейчас, если выросла) × 1,5', () => {
    const world = worldOn(ROWS);
    const villager = world.villagers.list[0]!;
    villager.needs.food = 80;
    const firm = 1 + keepMargin;
    // Work is worth its utility now, if more than when chosen: with an empty pile the need of wood
    // (step 1.9) raises it by `fire.woodBoost`.
    expect(woodNeed(world)).toBeCloseTo(1 + DATA.balance.fire.woodBoost, 12);
    expect(holdOf(world, villager, { activity: 'haul', utility: 0.18 })).toBeCloseTo(
      haulUtility * woodNeed(world) * firm,
      12,
    );
    expect(holdOf(world, villager, { activity: 'eat', utility: 0.3 })).toBeCloseTo(0.3 * firm, 12);
    // Grew hungrier on the way: the need now holds.
    villager.needs.food = 20;
    expect(holdOf(world, villager, { activity: 'eat', utility: 0.3 })).toBeCloseTo(0.64 * firm, 12);
    // Sleep — the wish now and a little; rest — nothing; an order — everything.
    expect(holdOf(world, villager, { activity: 'sleep', utility: 1 })).toBeCloseTo(
      sleepWish(world, villager) + sleepHold,
      12,
    );
    expect(holdOf(world, villager, { activity: 'rest', utility: 0.15 })).toBe(0);
    expect(holdOf(world, villager, { activity: 'order', utility: 0 })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('передумывает, только если другое лучше порога; начатое не ищет заново', () => {
    const world = worldOn(ROWS, [
      { x: 1, y: 0 },
      { x: 0, y: 2 },
    ]);
    world.tick = 5;
    const villager = world.villagers.list[0]!;
    villager.needs.food = 60; // eating is worth ≤ 0.16 × 1.1: below the hold of work
    const considered: Considered[] = [];
    expect(reconsider(world, villager, 'haul', 0.375, considered)).toBeNull();
    expect(considered.find((o) => o.kind === 'haul')).toMatchObject({
      current: true,
      searched: false,
      utility: 0.375,
    });
    villager.needs.food = 10; // 0.81 × availability: well over it
    expect(reconsider(world, villager, 'haul', 0.375)).toMatchObject({ kind: 'eat' });
    // Eating already: the bush is not searched again, and nothing else beats the meal.
    const eating: Considered[] = [];
    expect(reconsider(world, villager, 'eat', 0.9, eating)).toBeNull();
    expect(eating.find((o) => o.kind === 'eat')).toMatchObject({ current: true, searched: false });
  });

  it('журнал решений помнит последние ai.logSize', () => {
    const world = worldOn(ROWS);
    const villager = world.villagers.list[0]!;
    const decision = (tick: number): Decision => ({
      tick,
      why: 'done',
      from: 'haul',
      bar: null,
      plan: 'rest',
      utility: 0.15,
      ahead: null,
      options: [],
    });
    for (let tick = 1; tick <= logSize + 5; tick++) remember(villager, decision(tick));
    expect(villager.log).toHaveLength(logSize);
    expect(villager.log[0]!.tick).toBe(6);
    expect(villager.log.at(-1)!.tick).toBe(logSize + 5);
  });
});
