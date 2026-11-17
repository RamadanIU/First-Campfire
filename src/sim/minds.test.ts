import { describe, expect, it } from 'vitest';
import { worldOn } from '../../tests/scenario.ts';
import { availability, canUse, choose, fillTicks, reachFor, searchSource } from './minds.ts';
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
