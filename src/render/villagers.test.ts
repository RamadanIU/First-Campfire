import { describe, expect, it } from 'vitest';
import { PALETTE } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { DATA } from '../data/index.ts';
import { TIME } from '../sim/calendar.ts';
import { LOOKS, type Villager, type VillagerAction } from '../sim/villagers.ts';
import { linePixels, pathPixels } from './debugOverlay.ts';
import { bubbleOf, INTENT_TICKS, intentOf, PRESSING, pressingOf } from './thoughts.ts';
import {
  ACTION_ANIMATION,
  FEET,
  HAIR_RAMPS,
  SKIN_RAMPS,
  SLEEPY_POINTS,
  strideOf,
  swapOf,
  villagerPose,
  walkFrame,
} from './villagers.ts';

function villager(fields: Partial<Villager> = {}): Villager {
  return {
    id: 1,
    name: 'Радомир',
    sex: 'male',
    born: -80_000,
    birthplace: { x: 0, y: 0 },
    mother: null,
    father: null,
    spouse: null,
    children: [],
    memories: [],
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
    needs: { food: 100, water: 100, sleep: 100, warmth: 100, social: 100, leisure: 100 },
    health: 100,
    ranOut: { food: 0, water: 0, sleep: 0, warmth: 0, social: 0, leisure: 0 },
    nowhere: { food: 0, water: 0, sleep: 0, warmth: 0, social: 0, leisure: 0 },
    tooFar: { food: 0, water: 0, sleep: 0, warmth: 0, social: 0, leisure: 0 },
    load: null,
    noWork: 0,
    noStore: 0,
    seen: [],
    foods: [],
    plan: { activity: 'rest', utility: 0.15, since: 0, steps: ['stroll'] },
    thought: 0,
    log: [],
    ...fields,
  };
}

/** Half a tile: the sprites' 200 ms walking frames at 4 ticks per tile, 10 ticks per second. */
const STRIDE = 0.25;

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

  it('сидит у огня (шаг 1.9): лицом к огню в любую сторону (с 1.12 — и лицом к зрителю, и спиной); дышит', () => {
    const east = villagerPose(villager({ facing: 'e', action: { kind: 'sit' } }), 1, STRIDE);
    expect(east).toMatchObject({ sprite: 'man', animation: 'sit_e', frame: null, walking: false });
    const west = villagerPose(villager({ facing: 'w', action: { kind: 'sit' } }), 1, STRIDE);
    expect(west.animation).toBe('sit_w');
    // Step 1.12: facing the viewer or away it sits too (cross-legged).
    expect(
      villagerPose(villager({ facing: 's', action: { kind: 'sit' } }), 1, STRIDE).animation,
    ).toBe('sit_s');
    expect(
      villagerPose(villager({ facing: 'n', action: { kind: 'sit' } }), 1, STRIDE).animation,
    ).toBe('sit_n');
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

  it('кадр ходьбы — по пройденному пути: каждую четверть тайла, 8 кадров на два тайла', () => {
    expect([0, 0.24, 0.25, 0.5, 1, 1.75, 1.99, 2, 2.25].map((w) => walkFrame(w, STRIDE))).toEqual([
      0, 0, 1, 2, 4, 7, 7, 0, 1,
    ]);
    // Taken from the data and the sprite: 100 ms frames, 4 ticks per tile, 10 ticks per second.
    const frameMs = SPRITES.find((s) => s.name === 'man')!.animations.walk_e!.frameMs;
    expect(frameMs).toBe(100);
    expect(strideOf(100, DATA.balance.movement.walkTicksPerTile, TIME.ticksPerSecond)).toBe(STRIDE);
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

/** One of each action a villager can be busy with (fields that do not matter — zeros). */
const ACTIONS: readonly VillagerAction[] = [
  { kind: 'idle', until: 0 },
  { kind: 'walk', purpose: 'wander', goal: { x: 0, y: 0 }, path: [], waited: 0, source: null },
  { kind: 'eat', bush: 1, food: 'berries', next: 0 },
  { kind: 'eat_stored', item: 1, food: 'nuts', next: 0 },
  { kind: 'pick', bush: 1, food: 'nuts', next: 0 },
  { kind: 'drink', water: { x: 0, y: 0 }, next: 0 },
  { kind: 'sleep', fainted: false },
  { kind: 'pick_up', item: 1, resource: 'branches', until: 0 },
  { kind: 'put_down', resource: 'branches', until: 0 },
  { kind: 'take', item: 1, resource: 'branches', until: 0 },
  { kind: 'kindle', until: 0 },
  { kind: 'stoke', until: 0 },
  { kind: 'sit' },
];

describe('позы действий (шаг 1.12)', () => {
  const sprites = new Map(SPRITES.map((sprite) => [sprite.name, sprite]));
  const animation = (fields: Partial<Villager>, load = false) =>
    villagerPose(villager(fields), 1, STRIDE, load ? { sprite: 'carry_bundle', y: -20 } : null)
      .animation;

  it('у каждого действия этапа своя поза, у обоих жителей, во все 4 стороны', () => {
    for (const action of ACTIONS) {
      for (const facing of ['s', 'n', 'e', 'w'] as const) {
        for (const sex of ['male', 'female'] as const) {
          const pose = villagerPose(villager({ action, facing, sex }), 1, STRIDE);
          const def = sprites.get(pose.sprite)!;
          expect(Object.keys(def.animations), `${action.kind} ${facing} ${sex}`).toContain(
            pose.animation,
          );
        }
      }
    }
    // Every action done on its place has a pose of its own, not the standing one.
    for (const action of ACTIONS) {
      if (action.kind === 'idle' || action.kind === 'walk' || action.kind === 'sleep') continue;
      expect(animation({ action, facing: 'e' }), action.kind).not.toBe('idle_e');
      expect(ACTION_ANIMATION, action.kind).toHaveProperty(action.kind);
    }
  });

  it('ест, пьёт, собирает, приседает, разводит и подкладывает — разные позы', () => {
    const poses = ['eat', 'drink', 'pick', 'pick_up', 'kindle', 'stoke', 'eat_stored', 'sit'].map(
      (kind) => animation({ action: ACTIONS.find((a) => a.kind === kind)!, facing: 'e' }),
    );
    expect(new Set(poses).size).toBe(poses.length);
  });

  it('состояние видно по позе: голодный бредёт, замёрзший дрожит, сонный зевает', () => {
    const walking = { x: 10, toX: 11, progress: 0.5, prevX: 10.25, facing: 'e' as const };
    const full = { food: 100, water: 100, sleep: 100, warmth: 100, social: 100, leisure: 100 };
    const hungry = { ...full, food: DATA.balance.movement.hungryPoints - 1 };
    expect(animation({ ...walking, needs: full })).toBe('walk_e');
    expect(animation({ ...walking, needs: hungry })).toBe('trudge_e');
    // With a load the arms are up whatever the hunger.
    expect(animation({ ...walking, needs: hungry }, true)).toBe('carry_e');
    const cold = { ...full, warmth: DATA.balance.needs.warmth.shiverPoints - 1 };
    expect(animation({ needs: cold })).toBe('shiver_s');
    expect(animation({ needs: { ...full, sleep: SLEEPY_POINTS - 1 } })).toBe('yawn_s');
    expect(animation({ needs: full })).toBe('idle_s');
  });

  it('присев, ношу не держит над головой; стоя и идя — держит', () => {
    const look = { sprite: 'carry_bundle', y: -20 };
    const put = villager({ action: { kind: 'put_down', resource: 'branches', until: 0 } });
    expect(villagerPose(put, 1, STRIDE, look)).toMatchObject({ animation: 'crouch_s', load: null });
    expect(villagerPose(villager(), 1, STRIDE, look).load).not.toBeNull();
  });

  it('макушка: стоя — 24 пикселя над ступнями, присев и сидя — ниже', () => {
    expect(villagerPose(villager(), 1, STRIDE).top).toBe(24);
    const squat = villager({ action: { kind: 'drink', water: { x: 0, y: 0 }, next: 0 } });
    expect(villagerPose(squat, 1, STRIDE).top).toBeLessThan(24);
    expect(villagerPose(villager({ action: { kind: 'sit' } }), 1, STRIDE).top).toBeLessThan(24);
  });
});

describe('пузырьки мыслей (шаг 1.12)', () => {
  const full = { food: 100, water: 100, sleep: 100, warmth: 100, social: 100, leisure: 100 };
  const plan = (activity: Villager['plan']['activity'], since = 100) => ({
    activity,
    utility: 0.5,
    since,
    steps: [],
  });

  it('спящий — сон; острая нужда — её пузырёк, самая острая из нескольких', () => {
    expect(bubbleOf(villager(), 0, true, 2)).toBe('sleep');
    expect(pressingOf(villager({ needs: full }))).toBeNull();
    const hungry = DATA.balance.movement.hungryPoints - 1;
    expect(pressingOf(villager({ needs: { ...full, food: hungry } }))).toBe('food');
    expect(pressingOf(villager({ needs: { ...full, water: PRESSING.water - 1 } }))).toBe('water');
    expect(pressingOf(villager({ needs: { ...full, warmth: 10 } }))).toBe('cold');
    expect(pressingOf(villager({ needs: { ...full, sleep: PRESSING.sleep - 1 } }))).toBe('sleep');
    // Thirst at a tenth of its threshold presses more than hunger just under its own.
    const both = { ...full, food: hungry, water: PRESSING.water / 10 };
    expect(pressingOf(villager({ needs: both }))).toBe('water');
  });

  it('новое намерение — пузырёк на INTENT_TICKS тиков: еда, вода, несу, разведка, костёр', () => {
    const cases = [
      ['eat', 'food'],
      ['drink', 'water'],
      ['haul', 'carry'],
      ['store', 'carry'],
      ['scout', 'lost'],
      ['kindle', 'fire'],
      ['stoke', 'fire'],
      ['warm', 'cold'],
      ['sleep', 'sleep'],
    ] as const;
    for (const [activity, thought] of cases) {
      const one = villager({ needs: full, plan: plan(activity) });
      expect(intentOf(one, 100), activity).toBe(thought);
      expect(intentOf(one, 100 + INTENT_TICKS - 1), activity).toBe(thought);
      expect(intentOf(one, 100 + INTENT_TICKS), activity).toBeNull();
    }
    for (const activity of ['rest', 'sit', 'order'] as const) {
      expect(intentOf(villager({ plan: plan(activity) }), 100), activity).toBeNull();
    }
  });

  it('на дальнем зуме не загромождают: на ×0,5 — ничего, на ×1 — только нужды и сон', () => {
    const eating = villager({ needs: full, plan: plan('eat') });
    expect(bubbleOf(eating, 100, false, 2)).toBe('food');
    expect(bubbleOf(eating, 100, false, 4)).toBe('food');
    expect(bubbleOf(eating, 100, false, 1)).toBeNull();
    expect(bubbleOf(villager(), 0, true, 1)).toBe('sleep');
    const cold = villager({ needs: { ...full, warmth: 10 } });
    expect(bubbleOf(cold, 0, false, 1)).toBe('cold');
    expect(bubbleOf(cold, 0, false, 0.5)).toBeNull();
    expect(bubbleOf(villager(), 0, true, 0.5)).toBeNull();
  });
});
