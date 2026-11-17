import { describe, expect, it } from 'vitest';
import { addTick, createTickTimer, meanUs, measureTimerCost, percentileUs } from './timing.ts';

describe('замер времени тика', () => {
  it('среднее, худший и 99 % — по гистограмме, не больше худшего', () => {
    const timer = createTickTimer();
    for (let i = 0; i < 990; i++) addTick(timer, 1);
    for (let i = 0; i < 9; i++) addTick(timer, 10);
    addTick(timer, 1000);
    expect(timer.ticks).toBe(1000);
    expect(meanUs(timer)).toBeCloseTo((990 + 90 + 1000) / 1000, 10);
    expect(timer.maxUs).toBe(1000);
    // 99 % of ticks took 1 µs; the bucket edge overestimates by at most ≈ 4.4 %.
    expect(percentileUs(timer, 0.99)).toBeGreaterThanOrEqual(1);
    expect(percentileUs(timer, 0.99)).toBeLessThan(1.045);
    expect(percentileUs(timer, 0.995)).toBeGreaterThanOrEqual(10);
    expect(percentileUs(timer, 0.995)).toBeLessThan(10.45);
    expect(percentileUs(timer, 1)).toBe(1000);
  });

  it('пустой замер и нулевые тики не ломают счёт', () => {
    const timer = createTickTimer();
    expect(meanUs(timer)).toBe(0);
    expect(percentileUs(timer, 0.99)).toBe(0);
    addTick(timer, 0);
    expect(percentileUs(timer, 0.99)).toBe(0);
    addTick(timer, 1e9); // longer than the last bucket — still counted
    expect(timer.maxUs).toBe(1e9);
    expect(percentileUs(timer, 1)).toBe(1e9);
  });

  it('цена одного отсчёта часов — доли микросекунды', () => {
    const cost = measureTimerCost(2001);
    expect(cost).toBeGreaterThanOrEqual(0);
    expect(cost).toBeLessThan(5);
  });
});
