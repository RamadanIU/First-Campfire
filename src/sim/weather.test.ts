import { describe, expect, it } from 'vitest';
import { worldOn } from '../../tests/scenario.ts';
import { DATA } from '../data/index.ts';
import { calendarAt, tickAt } from './calendar.ts';
import type { WorldEvent } from './events.ts';
import { airTemperature, airTemperatureAt, feltAt, isFreezing, WEATHER_KINDS } from './weather.ts';
import { createWorld, runTicks } from './world.ts';

const { seasonTemp, phaseTemp, kindTemp, spellTicks, chances } = DATA.balance.weather;

describe('температура: сезон + время суток + погода', () => {
  it('сумма трёх слагаемых из таблицы', () => {
    expect(airTemperatureAt(tickAt(11, 300), 'snow')).toBe(
      seasonTemp.winter + phaseTemp.night + kindTemp.snow,
    );
    expect(airTemperatureAt(tickAt(5, 140), 'clear')).toBe(seasonTemp.summer + phaseTemp.day);
  });

  it('зимняя ночь холоднее всего, летний день теплее всего; зимой морозно', () => {
    const all = [];
    for (let day = 1; day <= 12; day++) {
      for (const tod of [10, 140, 260, 330]) {
        for (const kind of WEATHER_KINDS) all.push(airTemperatureAt(tickAt(day, tod), kind));
      }
    }
    expect(Math.min(...all)).toBe(airTemperatureAt(tickAt(11, 330), 'rain'));
    expect(Math.max(...all)).toBe(airTemperatureAt(tickAt(5, 140), 'clear'));
    expect(airTemperatureAt(tickAt(11, 140), 'clear')).toBeLessThan(0);
    expect(airTemperatureAt(tickAt(5, 330), 'clear')).toBeGreaterThan(
      DATA.balance.needs.warmth.comfort,
    );
  });

  it('у горящего костра теплее на fire.heat, к краю тепла — ни на сколько', () => {
    const world = worldOn(['..........', '..........', '..........', '..........', '..........']);
    const { camp } = world;
    expect(feltAt(world, camp.x + 1, camp.y)).toBe(airTemperature(world));
    world.fire.lit = 1;
    expect(feltAt(world, camp.x + 1, camp.y)).toBe(airTemperature(world) + DATA.balance.fire.heat);
    expect(feltAt(world, camp.x + DATA.balance.fire.heatRadius, camp.y)).toBe(
      airTemperature(world),
    );
  });
});

describe('погода: смена по сезонам', () => {
  /** Ten years of the weather of a world: its changes and what it was at every tick. */
  function history(seed: number) {
    const world = createWorld(seed);
    const kinds: string[] = [];
    for (let day = 0; day < 120; day++) {
      for (let tick = 0; tick < DATA.balance.time.ticksPerDay; tick++) {
        runTicks(world, 1);
        kinds.push(`${calendarAt(world.tick).season}:${world.weather.kind}`);
      }
    }
    const changes = world.events.list.filter(
      (e): e is Extract<WorldEvent, { type: 'weather_changed' }> => e.type === 'weather_changed',
    );
    return { world, kinds, changes };
  }

  it('дождь — не зимой, снег — только зимой; из ясной погоды — сначала тучи; причина — правило «погода»', () => {
    for (const seed of [1, 2, 3]) {
      const { kinds, changes } = history(seed);
      expect(kinds.some((k) => k === 'winter:rain')).toBe(false);
      expect(kinds.some((k) => k.endsWith(':snow') && !k.startsWith('winter'))).toBe(false);
      for (const kind of ['rain', 'snow', 'cloudy', 'clear']) {
        expect(
          kinds.some((k) => k.endsWith(`:${kind}`)),
          `${seed}: ${kind}`,
        ).toBe(true);
      }
      for (const change of changes) {
        if (change.from === 'clear') expect(['cloudy']).toContain(change.to);
        expect(change.cause).toEqual({ kind: 'rule', rule: 'weather' });
      }
    }
  });

  it('погода держится от spellTicks.min тиков; веса таблицы — без снега летом и дождя зимой', () => {
    const { changes } = history(4);
    for (let i = 1; i < changes.length; i++) {
      const gap = changes[i]!.tick - changes[i - 1]!.tick;
      const seasonStart = calendarAt(changes[i]!.tick).dayOfSeason === 1;
      if (!seasonStart) expect(gap).toBeGreaterThanOrEqual(spellTicks.min);
    }
    expect(chances.summer.snow).toBe(0);
    expect(chances.winter.rain).toBe(0);
  });

  it('одно зерно — одна погода; морозная ночь — только зимой', () => {
    const a = history(5).kinds;
    const b = history(5).kinds;
    expect(a).toEqual(b);
    const world = createWorld(5);
    world.tick = tickAt(11, 330);
    expect(isFreezing(world)).toBe(true);
    world.tick = tickAt(8, 330);
    world.weather.kind = 'clear';
    expect(isFreezing(world)).toBe(false);
  });
});
