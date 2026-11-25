import { describe, expect, it } from 'vitest';
import { PALETTE } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { DATA } from '../data/index.ts';
import { TIME } from '../sim/calendar.ts';
import { LOOKS, type Villager } from '../sim/villagers.ts';
import { linePixels, pathPixels } from './debugOverlay.ts';
import {
  FEET,
  HAIR_RAMPS,
  SKIN_RAMPS,
  strideOf,
  swapOf,
  villagerPose,
  walkFrame,
} from './villagers.ts';

function villager(fields: Partial<Villager> = {}): Villager {
  return {
    id: 1,
    sex: 'male',
    skin: 0,
    hair: 0,
    home: { x: 0, y: 0 },
    x: 10,
    y: 20,
    toX: 10,
    toY: 20,
    progress: 0,
    prevX: 10,
    prevY: 20,
    facing: 's',
    walked: 0,
    action: { kind: 'idle', until: 0 },
    needs: { food: 100, water: 100, sleep: 100, warmth: 100 },
    health: 100,
    ranOut: { food: 0, water: 0, sleep: 0, warmth: 0 },
    nowhere: { food: 0, water: 0, sleep: 0, warmth: 0 },
    load: null,
    noWork: 0,
    plan: { activity: 'rest', utility: 0.15, since: 0, steps: ['stroll'] },
    thought: 0,
    log: [],
    ...fields,
  };
}

/** Half a tile: the sprites' 200 ms walking frames at 4 ticks per tile, 10 ticks per second. */
const STRIDE = 0.5;

describe('житель на карте', () => {
  it('тона кожи и цвета волос — ряды палитры той же длины, сколько их у симуляции', () => {
    expect(SKIN_RAMPS).toHaveLength(LOOKS.skinTones);
    expect(HAIR_RAMPS).toHaveLength(LOOKS.hairColors);
    for (const ramp of [...SKIN_RAMPS, ...HAIR_RAMPS]) expect(PALETTE.ramps.has(ramp)).toBe(true);
    expect(swapOf(villager())).toEqual({});
    expect(swapOf(villager({ skin: 5, hair: 4 }))).toEqual({
      skin_light: 'skin_dark',
      hair_brown: 'hair_blond',
    });
    // The sprites are drawn in the first ramps — the swaps start from them.
    const legend = Object.values(SPRITES.find((sprite) => sprite.name === 'man')!.legend).join(' ');
    expect(legend).toContain(`${SKIN_RAMPS[0]}.`);
    expect(legend).toContain(`${HAIR_RAMPS[0]}.`);
  });

  it('стоит: ноги там же, где точка привязки объекта на тайле; дышит; глубина — по ногам', () => {
    const pose = villagerPose(villager({ facing: 'w' }), 0.4, STRIDE);
    expect(pose).toMatchObject({
      sprite: 'man',
      x: 10 * TILE_SIZE + FEET.x,
      y: 20 * TILE_SIZE + FEET.y,
      animation: 'idle_w',
      frame: null,
      walking: false,
    });
    expect(FEET).toEqual({ x: 8, y: 13 });
    // In front of low flowers of its own tile (≤ 2 px lower), behind anything of the row below.
    expect(pose.depth).toBeGreaterThan(pose.y + 2);
    expect(pose.depth).toBeLessThan(21 * TILE_SIZE + FEET.y - 2);
    expect(villagerPose(villager({ sex: 'female' }), 0, STRIDE).sprite).toBe('woman');
  });

  it('сидит у огня (шаг 1.9): сидячая поза боком, лицом к огню; дышит', () => {
    const east = villagerPose(villager({ facing: 'e', action: { kind: 'sit' } }), 1, STRIDE);
    expect(east).toMatchObject({ sprite: 'man', animation: 'sit_e', frame: null, walking: false });
    const west = villagerPose(villager({ facing: 'w', action: { kind: 'sit' } }), 1, STRIDE);
    expect(west.animation).toBe('sit_w');
    // Sideways only: facing the viewer or away, it stands (there is no such sitting pose).
    expect(
      villagerPose(villager({ facing: 's', action: { kind: 'sit' } }), 1, STRIDE).animation,
    ).toBe('idle_s');
  });

  it('идёт: место — между прошлым и нынешним тиком по alpha, целыми пикселями', () => {
    const walking = villager({
      x: 10,
      toX: 11,
      progress: 0.5,
      prevX: 10.25,
      facing: 'e',
      walked: 3,
    });
    const at = (alpha: number) => villagerPose(walking, alpha, STRIDE);
    expect(at(0).x).toBe(Math.round(10.25 * TILE_SIZE + FEET.x));
    expect(at(1).x).toBe(Math.round(10.5 * TILE_SIZE + FEET.x));
    expect(at(0.5).x).toBe(Math.round(10.375 * TILE_SIZE + FEET.x));
    expect(at(0.5)).toMatchObject({ animation: 'walk_e', walking: true });
    for (const alpha of [0, 0.3, 0.7, 1]) expect(Number.isInteger(at(alpha).x)).toBe(true);
  });

  it('кадр ходьбы — по пройденному пути: каждые полтайла, 4 кадра на два тайла', () => {
    expect([0, 0.49, 0.5, 1, 1.5, 1.99, 2, 2.5].map((w) => walkFrame(w, STRIDE))).toEqual([
      0, 0, 1, 2, 3, 3, 0, 1,
    ]);
    // Taken from the data and the sprite: 200 ms frames, 4 ticks per tile, 10 ticks per second.
    const frameMs = SPRITES.find((s) => s.name === 'man')!.animations.walk_e!.frameMs;
    expect(frameMs).toBe(200);
    expect(strideOf(200, DATA.balance.movement.walkTicksPerTile, TIME.ticksPerSecond)).toBe(STRIDE);
  });

  it('на ×20 ноги шагают в ногу с землёй: тот же путь — те же кадры, на паузе — не шагают', () => {
    // The frame depends on the way, not on how much real time it took.
    const frames = (walked: number) =>
      villagerPose(villager({ x: 10, toX: 11, progress: 0.5, prevX: 10.25, walked }), 1, STRIDE)
        .frame;
    expect(frames(2.5)).toBe(frames(2.5));
    expect(frames(2.5)).not.toBe(frames(3));
    // Paused mid-step: the same tick drawn again and again — the same frame.
    const paused = villager({ x: 10, toX: 11, progress: 0.5, prevX: 10.25, walked: 2.5 });
    const shown = new Set([0, 0.2, 0.9].map(() => villagerPose(paused, 1, STRIDE).frame));
    expect(shown.size).toBe(1);
  });
});

describe('отладочная линия пути', () => {
  it('отрезок — целые пиксели без пропусков, оба конца включены', () => {
    expect(linePixels(0, 0, 3, 0)).toEqual([0, 1, 2, 3].map((x) => ({ x, y: 0 })));
    expect(linePixels(0, 0, 2, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    const steep = linePixels(5, 0, 2, 9);
    expect(steep[0]).toEqual({ x: 5, y: 0 });
    expect(steep.at(-1)).toEqual({ x: 2, y: 9 });
    for (let i = 1; i < steep.length; i++) {
      const a = steep[i - 1]!;
      const b = steep[i]!;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
    }
  });

  it('путь — от ног жителя через точки ног каждого тайла', () => {
    const pixels = pathPixels({ x: 8, y: 13 }, [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(pixels[0]).toEqual({ x: 8, y: 13 });
    expect(pixels).toContainEqual({ x: 24, y: 13 });
    expect(pixels.at(-1)).toEqual({ x: 24, y: 29 });
    expect(new Set(pixels.map((p) => `${p.x},${p.y}`)).size).toBe(pixels.length);
  });
});
