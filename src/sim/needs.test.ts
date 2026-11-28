import { describe, expect, it } from 'vitest';
import { DATA } from '../data/index.ts';
import { TIME } from './calendar.ts';
import {
  FULL,
  fallPerTick,
  fullNeeds,
  harmPerTick,
  healPerTick,
  isSated,
  isShivering,
  liveTick,
  portionOf,
  satietyPerRation,
  sleepPerTick,
  urgency,
  warmthPerTick,
} from './needs.ts';

const DAY = TIME.ticksPerDay;

describe('потребности: числа GDD §4.2 ×10 (решение владельца, ADR-024) в тиках', () => {
  it('сытость пустеет за 25 суток, жажда — за 15', () => {
    expect(FULL / fallPerTick('food')).toBeCloseTo(25 * DAY, 9);
    expect(FULL / fallPerTick('water')).toBeCloseTo(15 * DAY, 9);
  });

  it('на нуле смерть: голод — через 40 суток, жажда — через 20; лечение — 2 суток', () => {
    expect(FULL / harmPerTick('food')).toBeCloseTo(40 * DAY, 9);
    expect(FULL / harmPerTick('water')).toBeCloseTo(20 * DAY, 9);
    expect(FULL / healPerTick()).toBeCloseTo(2 * DAY, 9);
  });

  it('рацион утоляет 40 пунктов сытости; горсть — четверть рациона, глоток — 10', () => {
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
    for (let tick = 1; tick <= 11 * 1000; tick++) {
      const result = liveTick(needs, health);
      health = result.health;
      for (const need of result.ranOut) ranOut.push(`${need}@${tick}`);
    }
    // Sleep (never slept) empties at 600 ticks, company (step 2.2) at 1 600, leisure at 2 000,
    // water at 6 000, food at 10 000 (± rounding).
    expect(ranOut).toHaveLength(5);
    expect(ranOut[0]).toMatch(/^sleep@(599|600|601)$/);
    expect(ranOut[1]).toMatch(/^social@(1599|1600|1601)$/);
    expect(ranOut[2]).toMatch(/^leisure@(1999|2000|2001)$/);
    expect(Number(ranOut[3]!.split('@')[1])).toBeGreaterThanOrEqual(5999);
    expect(Number(ranOut[3]!.split('@')[1])).toBeLessThanOrEqual(6001);
    expect(ranOut[3]).toMatch(/^water@/);
    expect(ranOut[4]).toMatch(/^food@/);
    // Warmth (step 1.10) follows the temperature, comfortable by default: it stays full.
    expect(needs).toEqual({ food: 0, water: 0, sleep: 0, warmth: FULL, social: 0, leisure: 0 });
    // Sleep at zero harms nothing: only thirst and hunger did.
    // Thirst has harmed health for ≈ 5 000 ticks, hunger for ≈ 1 000.
    expect(health).toBeCloseTo(FULL - 5000 * harmPerTick('water') - 1000 * harmPerTick('food'), 0);
  });

  it('сон: падает за 1,5 суток бодрствования, во сне на земле возвращается, на нуле не вредит', () => {
    expect(fallPerTick('sleep') * 600).toBeCloseTo(FULL, 9);
    // The ground: half of a bed (0 → 100 in a quarter of a day) — 0.5 a tick.
    expect(sleepPerTick()).toBeCloseTo(0.5, 9);
    const needs = { ...fullNeeds(), sleep: 40 };
    const asleep = liveTick(needs, 70, true);
    expect(needs.sleep).toBeCloseTo(40 + sleepPerTick(), 9);
    expect(needs.food).toBeLessThan(FULL);
    // Never above full.
    needs.sleep = FULL - 0.1;
    liveTick(needs, 70, true);
    expect(needs.sleep).toBe(FULL);
    // At zero: health still heals.
    const tired = { ...fullNeeds(), sleep: 0 };
    const result = liveTick(tired, 50);
    expect(result.empty).toEqual(['sleep']);
    expect(result.health).toBeGreaterThan(50);
    expect(asleep.health).toBeGreaterThan(70);
  });

  it('пока ни одна нужда не на нуле, здоровье возвращается, но не выше 100', () => {
    const needs = fullNeeds();
    const result = liveTick(needs, 50);
    expect(result.health).toBeCloseTo(50 + healPerTick(), 12);
    expect(liveTick(fullNeeds(), FULL).health).toBe(FULL);
    expect(result.empty).toEqual([]);
  });

  it('тепло (шаг 1.10): ниже удобной температуры убывает, выше — прибывает, на нуле — обморожение и вред здоровью', () => {
    const { comfort, pointsPerDegreeDay, deathDays, shiverPoints } = DATA.balance.needs.warmth;
    expect(warmthPerTick(comfort)).toBe(0);
    expect(warmthPerTick(comfort - 10) * TIME.ticksPerDay).toBeCloseTo(-10 * pointsPerDegreeDay, 9);
    expect(warmthPerTick(comfort + 5)).toBeGreaterThan(0);
    // By default (no temperature given) it is comfortable: warmth stays.
    const needs = { ...fullNeeds(), warmth: 50 };
    liveTick(needs, FULL);
    expect(needs.warmth).toBe(50);
    // Frost: falls to zero, marked once; then it harms health in `deathDays`.
    needs.warmth = 0.01;
    const first = liveTick(needs, FULL, false, comfort - 20);
    expect(first.ranOut).toEqual(['warmth']);
    expect(liveTick(needs, FULL, false, comfort - 20).ranOut).toEqual([]);
    expect(FULL / harmPerTick('warmth')).toBeCloseTo(deathDays * DAY, 9);
    expect(liveTick(needs, 50, false, comfort - 20).health).toBeCloseTo(
      50 - harmPerTick('warmth'),
      9,
    );
    // By the fire it comes back, never above full.
    needs.warmth = FULL - 0.01;
    liveTick(needs, FULL, false, comfort + 30);
    expect(needs.warmth).toBe(FULL);
    expect(isShivering(shiverPoints - 1)).toBe(true);
    expect(isShivering(shiverPoints)).toBe(false);
  });
});
