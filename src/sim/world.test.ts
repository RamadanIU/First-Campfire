import { describe, expect, it } from 'vitest';
import { PHASE_START, TICKS_PER_YEAR, tickAt } from './calendar.ts';
import { findEvent, type WorldEvent } from './events.ts';
import { FIELD } from './systems/fireflies.ts';
import { createWorld, runTicks, stepWorld } from './world.ts';

const eventsOf = (list: WorldEvent[], type: WorldEvent['type']) =>
  list.filter((event) => event.type === type);

describe('мир', () => {
  it('создаётся на тике 0 с событием рождения мира; следом приходят двое — по его причине', () => {
    const world = createWorld(7);
    expect(world.tick).toBe(0);
    expect(world.seed).toBe(7);
    const [created, ...arrived] = world.events.list;
    expect(created).toEqual({
      id: 1,
      tick: 0,
      type: 'world_created',
      seed: 7,
      cause: { kind: 'rule', rule: 'genesis' },
    });
    expect(arrived).toEqual([
      expect.objectContaining({
        id: 2,
        tick: 0,
        type: 'villager_arrived',
        villager: 1,
        sex: 'male',
      }),
      expect.objectContaining({
        id: 3,
        tick: 0,
        type: 'villager_arrived',
        villager: 2,
        sex: 'female',
      }),
    ]);
    for (const event of arrived) expect(event.cause).toEqual({ kind: 'event', event: 1 });
  });

  it('stepWorld сдвигает тик на один, runTicks — на N', () => {
    const world = createWorld(1);
    stepWorld(world);
    expect(world.tick).toBe(1);
    runTicks(world, 99);
    expect(world.tick).toBe(100);
  });

  it('календарь пишет в журнал смену фаз, сезонов и лет с причиной «календарь»', () => {
    const world = createWorld(1);
    runTicks(world, TICKS_PER_YEAR);
    const list = world.events.list;
    // 12 days × 4 phases; the very first dawn (tick 0) is the world's creation itself.
    expect(eventsOf(list, 'phase_started')).toHaveLength(12 * 4);
    expect(eventsOf(list, 'season_started').map((e) => e.tick)).toEqual([1200, 2400, 3600, 4800]);
    expect(eventsOf(list, 'year_started')).toEqual([
      expect.objectContaining({ tick: 4800, year: 2, cause: { kind: 'rule', rule: 'calendar' } }),
    ]);
    const night = list.find((e) => e.type === 'phase_started' && e.phase === 'night');
    expect(night).toMatchObject({ tick: PHASE_START.night, day: 1 });
    expect(night?.cause).toEqual({ kind: 'rule', rule: 'calendar' });
  });

  it('id событий идут подряд, тики не убывают', () => {
    const world = createWorld(3);
    runTicks(world, 5000);
    world.events.list.forEach((event, index) => {
      expect(event.id).toBe(index + 1);
      if (index > 0) expect(event.tick).toBeGreaterThanOrEqual(world.events.list[index - 1]!.tick);
    });
    expect(findEvent(world, 10)?.id).toBe(10);
    expect(findEvent(world, 999_999)).toBeUndefined();
  });
});

describe('светлячки (проверочная система)', () => {
  it('днём их нет, с наступлением ночи вылетают, на рассвете исчезают', () => {
    const world = createWorld(11);
    runTicks(world, PHASE_START.night - 1);
    expect(world.fireflies.swarm).toHaveLength(0);
    stepWorld(world); // night falls
    const swarm = world.fireflies.swarm.length;
    expect(swarm).toBeGreaterThanOrEqual(6);
    expect(swarm).toBeLessThanOrEqual(24);
    runTicks(world, tickAt(2) - world.tick); // next dawn
    expect(world.fireflies.swarm).toHaveLength(0);
  });

  it('причина вылета — событие «наступила ночь», причина исчезновения — «рассвет»', () => {
    const world = createWorld(11);
    runTicks(world, tickAt(2));
    const rose = world.events.list.find((e) => e.type === 'fireflies_rose');
    const gone = world.events.list.find((e) => e.type === 'fireflies_gone');
    expect(rose?.cause.kind).toBe('event');
    expect(gone?.cause.kind).toBe('event');
    const roseCause = rose?.cause.kind === 'event' ? findEvent(world, rose.cause.event) : undefined;
    const goneCause = gone?.cause.kind === 'event' ? findEvent(world, gone.cause.event) : undefined;
    expect(roseCause).toMatchObject({ type: 'phase_started', phase: 'night', tick: rose?.tick });
    expect(goneCause).toMatchObject({ type: 'phase_started', phase: 'dawn', tick: gone?.tick });
    expect(gone).toMatchObject({
      type: 'fireflies_gone',
      count: rose?.type === 'fireflies_rose' ? rose.count : -1,
    });
  });

  it('летают внутри луга, двигаются и мигают', () => {
    const world = createWorld(5);
    runTicks(world, PHASE_START.night);
    const start = world.fireflies.swarm.map((fly) => [fly.x, fly.y]);
    let blinks = 0;
    for (let i = 0; i < 100; i++) {
      const lit = world.fireflies.swarm.map((fly) => fly.lit);
      stepWorld(world);
      world.fireflies.swarm.forEach((fly, index) => {
        expect(fly.x).toBeGreaterThanOrEqual(0);
        expect(fly.x).toBeLessThanOrEqual(FIELD.width);
        expect(fly.y).toBeGreaterThanOrEqual(0);
        expect(fly.y).toBeLessThanOrEqual(FIELD.height);
        if (fly.lit !== lit[index]) blinks++;
      });
    }
    const moved = world.fireflies.swarm.filter(
      (fly, index) => fly.x !== start[index]![0] || fly.y !== start[index]![1],
    );
    expect(moved.length).toBe(world.fireflies.swarm.length);
    expect(blinks).toBeGreaterThan(0);
  });

  it('величина роя меняется от ночи к ночи', () => {
    const world = createWorld(9);
    runTicks(world, tickAt(30));
    const sizes = world.events.list.flatMap((e) => (e.type === 'fireflies_rose' ? [e.count] : []));
    expect(sizes).toHaveLength(29);
    expect(new Set(sizes).size).toBeGreaterThan(3);
  });
});
