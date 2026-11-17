import { describe, expect, it } from 'vitest';
import { TIME } from './calendar.ts';
import {
  FULL,
  fallPerTick,
  fullNeeds,
  harmPerTick,
  healPerTick,
  isSated,
  liveTick,
  portionOf,
  satietyPerRation,
  urgency,
} from './needs.ts';

const DAY = TIME.ticksPerDay;

describe('потребности: числа GDD §4.2 в тиках', () => {
  it('сытость пустеет за 2,5 суток, жажда — за 1,5', () => {
    expect(FULL / fallPerTick('food')).toBeCloseTo(2.5 * DAY, 9);
    expect(FULL / fallPerTick('water')).toBeCloseTo(1.5 * DAY, 9);
  });

  it('на нуле смерть: голод — через 4 суток, жажда — через 2; лечение — 2 суток', () => {
    expect(FULL / harmPerTick('food')).toBeCloseTo(4 * DAY, 9);
    expect(FULL / harmPerTick('water')).toBeCloseTo(2 * DAY, 9);
    expect(FULL / healPerTick()).toBeCloseTo(2 * DAY, 9);
  });

  it('рацион возвращает сытость одних суток; горсть — четверть рациона, глоток — 10', () => {
    expect(satietyPerRation()).toBe(40);
    expect(portionOf('food')).toBe(10);
    expect(portionOf('water')).toBe(10);
    expect(isSated(90, 'food')).toBe(false);
    expect(isSated(90.5, 'food')).toBe(true);
  });

  it('нужда: 0 при полной шкале, 1 при пустой', () => {
    expect(urgency(FULL)).toBe(0);
    expect(urgency(0)).toBe(1);
    expect(urgency(75)).toBe(0.25);
  });
});

describe('тик жизни', () => {
  it('шкалы падают; нужда, дошедшая до нуля, отмечена один раз', () => {
    const needs = fullNeeds();
    let health = FULL;
    const ranOut: string[] = [];
    for (let tick = 1; tick <= 1100; tick++) {
      const result = liveTick(needs, health);
      health = result.health;
      for (const need of result.ranOut) ranOut.push(`${need}@${tick}`);
    }
    // Water empties at 600 ticks, food at 1000 (± rounding of the sums).
    expect(ranOut).toHaveLength(2);
    expect(Number(ranOut[0]!.split('@')[1])).toBeGreaterThanOrEqual(599);
    expect(Number(ranOut[0]!.split('@')[1])).toBeLessThanOrEqual(601);
    expect(ranOut[0]).toMatch(/^water@/);
    expect(ranOut[1]).toMatch(/^food@/);
    expect(needs).toEqual({ food: 0, water: 0 });
    // Thirst has harmed health for ≈ 500 ticks, hunger for ≈ 100.
    expect(health).toBeCloseTo(FULL - 500 * harmPerTick('water') - 100 * harmPerTick('food'), 0);
  });

  it('пока ни одна нужда не на нуле, здоровье возвращается, но не выше 100', () => {
    const needs = fullNeeds();
    const result = liveTick(needs, 50);
    expect(result.health).toBeCloseTo(50 + healPerTick(), 12);
    expect(liveTick(fullNeeds(), FULL).health).toBe(FULL);
    expect(result.empty).toEqual([]);
  });
});
