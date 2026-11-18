/**
 * Villagers walk (step 1.3) — the criteria of the step as scenarios:
 *   - a villager reaches the given tile going round the water (a map with a river);
 *   - an unreachable target neither hangs the game nor breaks the villager;
 *   - villagers are never in the water or inside a tree, and never two on one tile (5 000 ticks);
 *   - one seed — one history, with walks, orders and a save in the middle of a step.
 */
import { describe, expect, it } from 'vitest';
import { hashState } from '../src/sim/hash.ts';
import { isWater } from '../src/sim/map.ts';
import { canStep, tileSpeed } from '../src/sim/path.ts';
import { createRng, intRange } from '../src/sim/rng.ts';
import { loadWorld, saveWorld } from '../src/sim/save.ts';
import { isStepping, orderWalk, positionOf, type Villager } from '../src/sim/villagers.ts';
import { createWorld, runTicks, stepWorld, type World } from '../src/sim/world.ts';
import { worldOn } from './scenario.ts';

/** A river from the north edge down to row 9: the way round is past its southern end. */
const RIVER = [
  '..........~~~...........',
  '..........~=~...........',
  '..T.......~=~......T....',
  '..........~=~...........',
  '.....T....~=~...........',
  '..........~=~.....T.....',
  '..........~=~...........',
  '..........,~,...........',
  '..........,~,...........',
  '..........,,,...........',
  '........................',
  '..T.....................',
];

/** Every way a villager could be in a wrong place right now; empty — all is well. */
function problems(world: World): string[] {
  const found: string[] = [];
  const { map, objects } = world;
  const list = world.villagers.list;
  for (const v of list) {
    const name = `житель ${v.id} на тике ${world.tick}`;
    if (tileSpeed(map, objects, v.x, v.y) === 0) found.push(`${name}: стоит в (${v.x}, ${v.y})`);
    if (tileSpeed(map, objects, v.toX, v.toY) === 0)
      found.push(`${name}: шагает в (${v.toX}, ${v.toY})`);
    const dx = v.toX - v.x;
    const dy = v.toY - v.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) found.push(`${name}: шаг через тайл`);
    else if (isStepping(v) && !canStep(map, objects, v.x, v.y, dx, dy)) {
      found.push(`${name}: срезает угол (${v.x}, ${v.y}) → (${v.toX}, ${v.toY})`);
    }
    if (!(v.progress >= 0 && v.progress < 1)) found.push(`${name}: продвижение ${v.progress}`);
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const tilesOf = (v: Villager) => [`${v.x},${v.y}`, `${v.toX},${v.toY}`];
      if (tilesOf(a).some((tile) => tilesOf(b).includes(tile))) {
        found.push(`жители ${a.id} и ${b.id} в одном тайле на тике ${world.tick}`);
      }
    }
  }
  return found;
}

/** Run `ticks` ticks checking the villagers after every one; returns the problems found. */
function watch(world: World, ticks: number, each?: (tick: number) => void): string[] {
  const found: string[] = [];
  for (let i = 0; i < ticks; i++) {
    each?.(i);
    stepWorld(world);
    found.push(...problems(world));
    if (found.length > 10) break;
  }
  return found;
}

describe('житель обходит воду', () => {
  it('на карте с рекой доходит до точки на том берегу — в обход, только по суше', () => {
    const world = worldOn(RIVER, [
      { x: 4, y: 2 },
      { x: 3, y: 10 },
    ]);
    const [man, woman] = world.villagers.list as [Villager, Villager];
    woman.action = { kind: 'idle', until: Number.MAX_SAFE_INTEGER };
    const goal = { x: 18, y: 2 };
    const result = orderWalk(world, man, goal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Straight across is 14 tiles; round the river's end and back up — far more.
    expect(result.path.length).toBeGreaterThan(14);
    expect(Math.max(...result.path.map((tile) => tile.y))).toBeGreaterThanOrEqual(9);

    let deepest = 0;
    let ticks = 0;
    while (!(man.x === goal.x && man.y === goal.y && !isStepping(man)) && ticks < 1000) {
      stepWorld(world);
      ticks++;
      expect(problems(world)).toEqual([]);
      const at = positionOf(man);
      deepest = Math.max(deepest, at.y);
      // The drawn position never crosses the water, not even between two tiles.
      expect(isWater(world.map, Math.round(at.x), Math.round(at.y))).toBe(false);
    }
    expect({ x: man.x, y: man.y }).toEqual(goal);
    expect(deepest).toBeGreaterThanOrEqual(9);
    // Walking at the pace of the ground: a little longer than 4 ticks per tile of the path.
    expect(ticks).toBeGreaterThanOrEqual(4 * result.path.length);
    expect(ticks).toBeLessThan(4 * 1.5 * result.path.length + 10);
  });
});

describe('недостижимая цель', () => {
  it('остров посреди озера: приказ отклонён сразу, житель живёт дальше как жил', () => {
    const LAKE = [
      '..............',
      '...~~~~~~~~...',
      '...~======~...',
      '...~=,,,,=~...',
      '...~=,..,=~...',
      '...~=,,,,=~...',
      '...~======~...',
      '...~~~~~~~~...',
      '..............',
    ];
    const world = worldOn(LAKE, [
      { x: 1, y: 4 },
      { x: 12, y: 4 },
    ]);
    const [man] = world.villagers.list as [Villager, Villager];
    const result = orderWalk(world, man, { x: 6, y: 4 });
    expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
    // Only the land around the lake was looked at.
    expect(result.explored).toBeLessThan(14 * 9);
    expect(watch(world, 2000)).toEqual([]);
    // The villager did not freeze: it went on wandering on its side.
    expect(man.walked).toBeGreaterThan(10);
  });

  it('на том берегу реки, которая пересекает карту: «недостижима» быстро, без зависания', () => {
    // Worlds whose river crosses the whole map: the far bank cannot be reached (no fords yet).
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 5; seed++) {
      const world = createWorld(seed);
      const [man] = world.villagers.list as [Villager, Villager];
      const { map, objects } = world;
      // The bank across: the first land tile beyond the water going right, then left.
      let target: { x: number; y: number } | null = null;
      for (const dir of [1, -1]) {
        let x = man.x;
        while (x > 0 && x < map.width - 1 && !isWater(map, x, man.y)) x += dir;
        while (x > 0 && x < map.width - 1 && isWater(map, x, man.y)) x += dir;
        if (isWater(map, x - dir, man.y) && tileSpeed(map, objects, x, man.y) > 0) {
          target = { x, y: man.y };
          break;
        }
      }
      if (!target) continue;
      const started = performance.now();
      const result = orderWalk(world, man, target);
      const ms = performance.now() - started;
      if (result.ok) continue; // a lake: the far bank is reachable round it
      checked++;
      expect(['unreachable', 'too_far']).toContain(result.reason);
      expect(ms).toBeLessThan(200);
      expect(watch(world, 500)).toEqual([]);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('инвариант: не в воде, не в дереве, не вдвоём на тайле', () => {
  it('зёрна 1…20, по 5 000 тиков спокойного блуждания', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld(seed);
      expect(watch(world, 5000), `зерно ${seed}`).toEqual([]);
      for (const villager of world.villagers.list) expect(villager.walked).toBeGreaterThan(50);
    }
  });

  it('и с приказами в случайные точки карты (через реки, в лес, в воду) — 5 000 тиков', () => {
    for (const seed of [1, 2, 5, 7, 11]) {
      const world = createWorld(seed);
      const rng = createRng(seed, 'test-orders');
      const { width, height } = world.map;
      const found = watch(world, 5000, (tick) => {
        if (tick % 150 !== 0) return;
        const villager = world.villagers.list[intRange(rng, 0, 1)]!;
        orderWalk(world, villager, {
          x: intRange(rng, 0, width - 1),
          y: intRange(rng, 0, height - 1),
        });
      });
      expect(found, `зерно ${seed}`).toEqual([]);
    }
  });
});

describe('детерминизм с жителями', () => {
  it('одно зерно — одни и те же шаги, и после сохранения посреди шага', () => {
    const history = (seed: number, saveAt: number | null) => {
      let world = createWorld(seed);
      const steps: string[] = [];
      for (let tick = 0; tick < 3000; tick++) {
        if (tick === 700) orderWalk(world, world.villagers.list[0]!, { x: 10, y: 10 });
        if (tick === saveAt) {
          const loaded = loadWorld(saveWorld(world));
          if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
          world = loaded.world;
        }
        stepWorld(world);
        steps.push(world.villagers.list.map((v) => `${v.x},${v.y}>${v.toX},${v.toY}`).join('|'));
      }
      return { steps, hash: hashState(world) };
    };
    const once = history(3, null);
    expect(history(3, null)).toEqual(once);
    // Save in the middle of a step (find such a tick) — the history goes on the same.
    const world = createWorld(3);
    runTicks(world, 900);
    while (!world.villagers.list.some(isStepping)) stepWorld(world);
    expect(history(3, world.tick)).toEqual(once);
    expect(history(4, null).hash).not.toBe(once.hash);
  });
});
