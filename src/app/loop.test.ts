import { describe, expect, it } from 'vitest';
import { hashState } from '../sim/hash.ts';
import { createWorld, stepWorld } from '../sim/world.ts';
import { createGameLoop, type Speed } from './loop.ts';

const FRAME_RATES = [4, 10, 24, 30, 50, 60, 75, 90, 120, 144, 165, 240];

/** Run the loop for `seconds` of real time at `fps` frames per second; return ticks run. */
function play(speed: Speed, fps: number, seconds = 1): number {
  let ticks = 0;
  const loop = createGameLoop(() => ticks++, { ticksPerSecond: 10, speed, now: () => 0 });
  for (let frame = 0; frame < fps * seconds; frame++) loop.advance(1000 / fps);
  return ticks;
}

describe('игровой цикл', () => {
  it('за секунду на ×20 выполняется 200 тиков при любой частоте кадров', () => {
    for (const fps of FRAME_RATES) expect(play(20, fps), `${fps} кадров/с`).toBe(200);
  });

  it('за секунду: ×1 — 10, ×2 — 20, ×5 — 50 тиков; пауза — 0', () => {
    for (const fps of FRAME_RATES) {
      expect(play(1, fps), `×1, ${fps} кадров/с`).toBe(10);
      expect(play(2, fps), `×2, ${fps} кадров/с`).toBe(20);
      expect(play(5, fps), `×5, ${fps} кадров/с`).toBe(50);
      expect(play(0, fps), `пауза, ${fps} кадров/с`).toBe(0);
    }
  });

  it('неровные кадры дают то же число тиков, что и ровные', () => {
    let ticks = 0;
    const loop = createGameLoop(() => ticks++, { ticksPerSecond: 10, speed: 5, now: () => 0 });
    const frames = [16, 17, 15, 33, 8, 16.7, 50, 12.3]; // sum = 168 ms
    for (let repeat = 0; repeat < 125; repeat++) for (const ms of frames) loop.advance(ms);
    expect(ticks).toBe(1050); // 21 s × 50 ticks/s
  });

  it('мир через 60 секунд одинаков при 30 и 144 кадрах в секунду', () => {
    const hashAt = (fps: number) => {
      const world = createWorld(42);
      const loop = createGameLoop(() => stepWorld(world), {
        ticksPerSecond: 10,
        speed: 20,
        now: () => 0,
      });
      for (let frame = 0; frame < fps * 60; frame++) loop.advance(1000 / fps);
      return { tick: world.tick, hash: hashState(world) };
    };
    const slow = hashAt(30);
    expect(slow.tick).toBe(12_000);
    expect(hashAt(144)).toEqual(slow);
  });

  it('пауза замораживает и тики, и интерполяцию; повторное нажатие возвращает скорость', () => {
    let ticks = 0;
    const loop = createGameLoop(() => ticks++, { ticksPerSecond: 10, speed: 5, now: () => 0 });
    loop.advance(30); // 150 ms of game time: 1 tick + half
    expect(ticks).toBe(1);
    expect(loop.alpha).toBeCloseTo(0.5);
    loop.togglePause();
    expect(loop.speed).toBe(0);
    loop.advance(1000);
    expect(ticks).toBe(1);
    expect(loop.alpha).toBeCloseTo(0.5);
    loop.togglePause();
    expect(loop.speed).toBe(5);
    loop.setSpeed(20);
    loop.togglePause();
    loop.togglePause();
    expect(loop.speed).toBe(20);
  });

  it('долгий кадр (вкладка в фоне) не вызывает лавину тиков', () => {
    let ticks = 0;
    const loop = createGameLoop(() => ticks++, { ticksPerSecond: 10, speed: 20, now: () => 0 });
    loop.advance(60_000); // a minute away from the tab
    expect(ticks).toBe(50); // counted as 250 ms × 20
  });

  it('медленные тики: цикл укладывается в бюджет кадра и сбрасывает долг', () => {
    let clock = 0;
    let ticks = 0;
    const loop = createGameLoop(
      () => {
        ticks++;
        clock += 10; // every tick costs 10 ms
      },
      { ticksPerSecond: 10, speed: 20, budgetMs: 30, now: () => clock },
    );
    loop.advance(250); // owes 50 ticks
    expect(ticks).toBe(3);
    expect(loop.lagging).toBe(true);
    loop.advance(0); // the debt is gone, not carried into the next frame
    expect(ticks).toBe(3);
    expect(loop.lagging).toBe(false);
  });

  it('отрицательное и нечисловое время игнорируется', () => {
    let ticks = 0;
    const loop = createGameLoop(() => ticks++, { ticksPerSecond: 10, now: () => 0 });
    loop.advance(-500);
    loop.advance(Number.NaN);
    loop.advance(Number.POSITIVE_INFINITY);
    expect(ticks).toBe(0);
  });
});
