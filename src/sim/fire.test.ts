import { describe, expect, it } from 'vitest';
import { meadow, worldOn } from '../../tests/scenario.ts';
import { DATA } from '../data/index.ts';
import { tickAt } from './calendar.ts';
import {
  burnPerTick,
  feedFire,
  fireRoom,
  fireSystem,
  fuelTillMorning,
  hearthOf,
  isEvening,
  isEveningOrNight,
  lightFire,
  WOOD,
  warmthAt,
} from './fire.ts';
import { objectAt, placeObject } from './objects.ts';
import { placeVillager } from './villagers.ts';
import type { World } from './world.ts';

const DAY = DATA.balance.time.ticksPerDay;
const { maxFuel, heatRadius, fuelPerDay } = DATA.balance.fire;

/** A meadow world whose villager 1 holds `count` branches beside the camp (west of it). */
function withWood(count: number, rows = meadow(12, 10)): World {
  const world = worldOn(rows);
  const villager = world.villagers.list[0]!;
  placeVillager(world, villager, world.camp.x - 1, world.camp.y);
  villager.load = { id: world.items.nextId++, resource: WOOD, count };
  world.items.made += count;
  return world;
}

describe('костёр: огонь и дрова', () => {
  it('разведённый огонь: очаг на середине стоянки, дрова из рук — в огонь (и в учёт сожжённого)', () => {
    const world = withWood(4);
    const villager = world.villagers.list[0]!;
    expect(lightFire(world, villager)).toBe(true);
    expect(hearthOf(world)).toMatchObject({ def: 'campfire', state: 'burning' });
    expect(world.fire).toMatchObject({ fuel: 4, fed: 4 });
    expect(world.fire.lit).toBeGreaterThan(0);
    expect(world.items.burned).toBe(4);
    expect(villager.load).toBeNull();
  });

  it('в огонь не кладут больше предела: остаток остаётся в руках', () => {
    const world = withWood(10);
    const villager = world.villagers.list[0]!;
    lightFire(world, villager);
    expect(world.fire.fuel).toBe(maxFuel);
    expect(villager.load?.count).toBe(10 - maxFuel);
    expect(fireRoom(world)).toBe(0);
    expect(feedFire(world, villager)).toBe(0);
  });

  it('пока на месте очага кто-то стоит, его не построить; цветы на месте очага вытаптываются', () => {
    const world = withWood(3);
    const [villager, other] = world.villagers.list;
    placeVillager(world, other!, world.camp.x, world.camp.y);
    expect(lightFire(world, villager!)).toBe(false);
    expect(hearthOf(world)).toBeUndefined();
    placeVillager(world, other!, world.camp.x + 3, world.camp.y);
    placeObject(world.map, world.objects, 'flowers', world.camp.x, world.camp.y);
    expect(lightFire(world, villager!)).toBe(true);
    expect(objectAt(world.map, world.objects, world.camp.x, world.camp.y)?.def).toBe('campfire');
  });

  it('горит равномерно: весной охапка в сутки, зимой — три (GDD §13.3)', () => {
    const world = withWood(1);
    expect(burnPerTick(world)).toBeCloseTo(fuelPerDay.spring / DAY, 12);
    world.tick = tickAt(10, 100);
    expect(burnPerTick(world)).toBeCloseTo(fuelPerDay.winter / DAY, 12);
    expect(fuelPerDay).toMatchObject({ summer: 1, winter: 3 });
  });

  it('дрова кончились — гаснет: событие с причиной «прогорели дрова», очаг остаётся', () => {
    const world = withWood(1);
    lightFire(world, world.villagers.list[0]!);
    for (let i = 0; i < DAY; i++) {
      world.tick += 1;
      fireSystem.step(world);
    }
    const out = world.events.list.find((e) => e.type === 'fire_out');
    expect(out).toMatchObject({ burned: 1, cause: { kind: 'rule', rule: 'fuel' } });
    expect(world.fire).toMatchObject({ lit: 0, fuel: 0, fed: 0 });
    expect(hearthOf(world)?.state).toBe('out');
  });

  it('тепло: полное у огня, слабеет к fire.heatRadius, нет огня — нет тепла', () => {
    const world = withWood(2);
    const { camp } = world;
    expect(warmthAt(world, camp.x + 1, camp.y)).toBe(0);
    lightFire(world, world.villagers.list[0]!);
    expect(warmthAt(world, camp.x + 1, camp.y)).toBe(1);
    expect(warmthAt(world, camp.x + 1, camp.y + 1)).toBeGreaterThan(0.5);
    expect(warmthAt(world, camp.x + 2, camp.y)).toBeGreaterThan(0);
    expect(warmthAt(world, camp.x + 2, camp.y)).toBeLessThan(1);
    expect(warmthAt(world, camp.x + heatRadius, camp.y)).toBe(0);
  });

  it('вечер — с fire.eveningTicks до заката и до ночи; дров «до утра» — по нынешнему расходу', () => {
    const eveningTicks = DATA.balance.fire.eveningTicks.spring;
    expect(isEvening(tickAt(1, 240 - eveningTicks - 1))).toBe(false);
    expect(isEvening(tickAt(1, 240 - eveningTicks))).toBe(true);
    // Step 1.10: a winter evening comes earlier.
    const winter = DATA.balance.fire.eveningTicks.winter;
    expect(winter).toBeGreaterThan(eveningTicks);
    expect(isEvening(tickAt(10, 240 - winter))).toBe(true);
    expect(isEvening(tickAt(10, 240 - winter - 1))).toBe(false);
    expect(isEvening(tickAt(1, 279))).toBe(true);
    expect(isEvening(tickAt(1, 280))).toBe(false);
    expect(isEveningOrNight(tickAt(1, 280))).toBe(true);
    expect(isEveningOrNight(tickAt(2, 10))).toBe(false);
    const world = withWood(1);
    world.tick = tickAt(1, 240);
    // From dusk to tomorrow's day (tick 40): 200 ticks at one armful a day.
    expect(fuelTillMorning(world)).toBeCloseTo(200 / DAY, 12);
  });
});
