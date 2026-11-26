import { describe, expect, it } from 'vitest';
import { fillStore, meadow, worldOn } from '../../tests/scenario.ts';
import { DATA } from '../data/index.ts';
import { findCampSite } from './mapgen.ts';
import { objectAt } from './objects.ts';
import { DIAGONAL, tileSpeed } from './path.ts';
import {
  facingOf,
  isStepping,
  isTrudging,
  LOOKS,
  orderWalk,
  positionOf,
  type Villager,
  villagersSystem,
} from './villagers.ts';
import { createWorld, runTicks, stepWorld, type World } from './world.ts';

const WALK = DATA.balance.movement.walkTicksPerTile;

/** Keep a villager standing (resting) for good: it does not wander off. */
function hold(villager: Villager): void {
  villager.action = { kind: 'idle', until: Number.MAX_SAFE_INTEGER };
}

/** Ticks until the villager has stopped on `goal`, or throws after `most` ticks. */
function ticksToReach(
  world: World,
  villager: Villager,
  goal: { x: number; y: number },
  most = 2000,
) {
  for (let ticks = 1; ticks <= most; ticks++) {
    stepWorld(world);
    if (villager.x === goal.x && villager.y === goal.y && !isStepping(villager)) return ticks;
  }
  throw new Error(`житель не дошёл до (${goal.x}, ${goal.y}) за ${most} тиков`);
}

describe('первые двое', () => {
  it('мужчина и женщина приходят к месту для стоянки и стоят по сторонам от него лицом друг к другу', () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const world = createWorld(seed);
      const camp = findCampSite(world.map, world.objects)!;
      const [man, woman] = world.villagers.list;
      expect(world.villagers.list).toHaveLength(2);
      expect([man!.sex, woman!.sex]).toEqual(['male', 'female']);
      expect(man!.home).toEqual({ x: camp.x, y: camp.y });
      expect(woman!.home).toEqual(man!.home);
      for (const villager of [man!, woman!]) {
        expect(Math.abs(villager.x - camp.x) + Math.abs(villager.y - camp.y)).toBeLessThanOrEqual(
          2,
        );
        expect(tileSpeed(world.map, world.objects, villager.x, villager.y)).toBeGreaterThan(0);
        expect(objectAt(world.map, world.objects, villager.x, villager.y)).toBeUndefined();
        expect(villager.skin).toBeGreaterThanOrEqual(0);
        expect(villager.skin).toBeLessThan(LOOKS.skinTones);
        expect(villager.hair).toBeGreaterThanOrEqual(0);
        expect(villager.hair).toBeLessThan(LOOKS.hairColors);
        expect(villager.action.kind).toBe('idle');
      }
      expect(man!.x).toBeLessThan(woman!.x);
      expect([man!.facing, woman!.facing]).toEqual(['e', 'w']);
    }
  });

  it('у разных зёрен — разная внешность', () => {
    const looks = new Set(
      Array.from({ length: 30 }, (_, i) =>
        createWorld(i + 1)
          .villagers.list.map((v) => `${v.skin}/${v.hair}`)
          .join(' '),
      ),
    );
    expect(looks.size).toBeGreaterThan(15);
  });
});

describe('ходьба', () => {
  it('тайл травы — за 4 тика (GDD §13.1); 5 тайлов — за 20, лицом по ходу, пройдено 5', () => {
    const world = worldOn(meadow(12, 6), [
      { x: 1, y: 2 },
      { x: 10, y: 5 },
    ]);
    const [man, woman] = world.villagers.list as [Villager, Villager];
    hold(woman);
    expect(orderWalk(world, man, { x: 6, y: 2 }).ok).toBe(true);
    expect(ticksToReach(world, man, { x: 6, y: 2 })).toBe(5 * WALK);
    expect(man.facing).toBe('e');
    expect(man.walked).toBeCloseTo(5, 12);
    expect(man.action.kind).toBe('idle');
  });

  it('голодный бредёт медленнее (шаг 1.12, столп 2): сытость ниже порога — скорость × hungrySpeed', () => {
    const { hungryPoints, hungrySpeed } = DATA.balance.movement;
    expect(hungrySpeed).toBeLessThan(1);
    const walk = (food: number) => {
      const world = worldOn(meadow(12, 6), [
        { x: 1, y: 2 },
        { x: 10, y: 5 },
      ]);
      const [man, woman] = world.villagers.list as [Villager, Villager];
      hold(woman);
      man.needs.food = food;
      expect(isTrudging(man)).toBe(food < hungryPoints);
      expect(orderWalk(world, man, { x: 6, y: 2 }).ok).toBe(true);
      return ticksToReach(world, man, { x: 6, y: 2 });
    };
    expect(walk(hungryPoints + 5)).toBe(5 * WALK);
    expect(walk(hungryPoints - 5)).toBe(Math.ceil((5 * WALK) / hungrySpeed - 1e-9));
  });

  it('по песку медленнее (скорость 0,8 — тайл за 5 тиков), наискосок — в √2 дольше', () => {
    const world = worldOn(
      [',,,,,,,,', ',,,,,,,,', '........', '........', '........', '........'],
      [
        { x: 0, y: 0 },
        { x: 7, y: 5 },
      ],
    );
    const [man, woman] = world.villagers.list as [Villager, Villager];
    hold(woman);
    orderWalk(world, man, { x: 4, y: 0 });
    expect(ticksToReach(world, man, { x: 4, y: 0 })).toBe(4 * 5);
    orderWalk(world, man, { x: 4, y: 1 });
    ticksToReach(world, man, { x: 4, y: 1 });
    // Three diagonal steps down-left onto grass: 3 × 4 × √2 ≈ 16.97 ticks → arrives on tick 17.
    orderWalk(world, man, { x: 1, y: 4 });
    expect(ticksToReach(world, man, { x: 1, y: 4 })).toBe(Math.ceil(3 * WALK * DIAGONAL));
    expect(man.facing).toBe('w');
  });

  it('позиция — тайл и продвижение к следующему; prevX/prevY — где был тиком раньше', () => {
    const world = worldOn(meadow(8, 4), [
      { x: 1, y: 1 },
      { x: 7, y: 3 },
    ]);
    const [man, woman] = world.villagers.list as [Villager, Villager];
    hold(woman);
    orderWalk(world, man, { x: 3, y: 1 });
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      const before = positionOf(man);
      stepWorld(world);
      expect({ x: man.prevX, y: man.prevY }).toEqual(before);
      seen.push(positionOf(man).x);
    }
    expect(seen).toEqual([1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]);
    expect(isStepping(man)).toBe(false);
  });

  it('направление взгляда: на диагонали — вбок', () => {
    expect([facingOf(1, 0), facingOf(-1, 0), facingOf(0, -1), facingOf(0, 1)]).toEqual([
      'e',
      'w',
      'n',
      's',
    ]);
    expect([facingOf(1, 1), facingOf(-1, -1)]).toEqual(['e', 'w']);
  });

  it('приказ посреди шага: шаг доходит до конца, путь — от следующего тайла', () => {
    const world = worldOn(meadow(10, 5), [
      { x: 2, y: 2 },
      { x: 9, y: 4 },
    ]);
    const [man, woman] = world.villagers.list as [Villager, Villager];
    hold(woman);
    orderWalk(world, man, { x: 6, y: 2 });
    runTicks(world, 2); // half way to (3, 2)
    expect(man.toX).toBe(3);
    const result = orderWalk(world, man, { x: 3, y: 0 });
    expect(result.ok && result.path).toEqual([
      { x: 3, y: 1 },
      { x: 3, y: 0 },
    ]);
    expect(ticksToReach(world, man, { x: 3, y: 0 })).toBe(2 + 2 * WALK);
  });

  it('недостижимый приказ ничего не меняет: житель идёт, куда шёл', () => {
    const world = worldOn(
      ['......~~~', '......~.~', '......~~~'],
      [
        { x: 0, y: 1 },
        { x: 5, y: 2 },
      ],
    );
    const [man, woman] = world.villagers.list as [Villager, Villager];
    hold(woman);
    orderWalk(world, man, { x: 4, y: 1 });
    const before = structuredClone(man.action);
    expect(orderWalk(world, man, { x: 7, y: 1 })).toMatchObject({
      ok: false,
      reason: 'unreachable',
    });
    expect(orderWalk(world, man, { x: 6, y: 0 })).toMatchObject({ ok: false, reason: 'blocked' });
    expect(man.action).toEqual(before);
    expect(ticksToReach(world, man, { x: 4, y: 1 })).toBe(4 * WALK);
  });
});

describe('двое не стоят в одном тайле', () => {
  it('навстречу друг другу по узкому проходу: ждут, ищут обход, не сходятся в одном тайле', () => {
    const world = worldOn(
      ['TTTTTTTTTT', '..........', 'TTTTTTTTTT'],
      [
        { x: 0, y: 1 },
        { x: 9, y: 1 },
      ],
    );
    const [man, woman] = world.villagers.list as [Villager, Villager];
    orderWalk(world, man, { x: 9, y: 1 });
    orderWalk(world, woman, { x: 0, y: 1 });
    for (let tick = 0; tick < 300; tick++) {
      stepWorld(world);
      const tilesOf = (v: Villager) => [`${v.x},${v.y}`, `${v.toX},${v.toY}`];
      for (const tile of tilesOf(man)) expect(tilesOf(woman)).not.toContain(tile);
    }
    // Nobody got through the other: they met and gave up — standing, not stuck mid-step.
    expect(man.x).toBeLessThan(woman.x);
    expect(isStepping(man) || isStepping(woman)).toBe(false);
  });

  it('стоящий на пути — обходят по соседнему ряду', () => {
    const world = worldOn(meadow(9, 3), [
      { x: 0, y: 1 },
      { x: 4, y: 1 },
    ]);
    const [man, woman] = world.villagers.list as [Villager, Villager];
    hold(woman);
    const result = orderWalk(world, man, { x: 8, y: 1 });
    // The path already goes round the one who stands in the way.
    expect(result.ok && result.path).not.toContainEqual({ x: 4, y: 1 });
    ticksToReach(world, man, { x: 8, y: 1 });
  });

  it('тот, кто встал на путь позже, — житель ждёт, потом обходит', () => {
    const world = worldOn(meadow(9, 3), [
      { x: 0, y: 1 },
      { x: 4, y: 0 },
    ]);
    const [man, woman] = world.villagers.list as [Villager, Villager];
    hold(woman);
    orderWalk(world, man, { x: 8, y: 1 });
    // The woman steps into the man's way and stands there.
    orderWalk(world, woman, { x: 4, y: 1 });
    ticksToReach(world, woman, { x: 4, y: 1 });
    hold(woman);
    const ticks = ticksToReach(world, man, { x: 8, y: 1 });
    expect(ticks).toBeLessThan(8 * WALK + DATA.balance.villagers.giveWayTicks + 20);
  });
});

describe('блуждание без потребностей', () => {
  it('отдыхает, потом идёт к свободному тайлу не дальше радиуса от дома; всегда на траве', () => {
    const world = worldOn(meadow(40, 40), [
      { x: 20, y: 20 },
      { x: 22, y: 20 },
    ]);
    // No needs, and nothing to store (step 1.11b: else in autumn they would scout for nuts).
    fillStore(world);
    const radius = DATA.balance.villagers.wanderRadius;
    const goals = new Set<string>();
    let farthest = 0;
    for (let tick = 0; tick < 6000; tick++) {
      villagersSystem.step(world);
      world.tick += 1;
      for (const villager of world.villagers.list) {
        const { x, y } = positionOf(villager);
        farthest = Math.max(farthest, Math.hypot(x - villager.home.x, y - villager.home.y));
        if (villager.action.kind === 'walk') {
          const { goal } = villager.action;
          goals.add(`${goal.x},${goal.y}`);
          expect(
            Math.hypot(goal.x - villager.home.x, goal.y - villager.home.y),
          ).toBeLessThanOrEqual(radius);
        }
      }
    }
    expect(farthest).toBeLessThanOrEqual(radius + 1e-9);
    expect(goals.size).toBeGreaterThan(20);
    for (const villager of world.villagers.list) expect(villager.walked).toBeGreaterThan(100);
  });

  it('стоит на голой земле, а не на цветах и не в траве', () => {
    const rows = meadow(16, 16).map((row, y) =>
      [...row].map((c, x) => ((x + y) % 2 === 0 ? '*' : c)).join(''),
    );
    const world = worldOn(rows, [
      { x: 7, y: 8 },
      { x: 9, y: 8 },
    ]);
    for (let tick = 0; tick < 3000; tick++) {
      stepWorld(world);
      for (const villager of world.villagers.list) {
        if (villager.action.kind === 'walk') {
          const { goal } = villager.action;
          expect(objectAt(world.map, world.objects, goal.x, goal.y)).toBeUndefined();
        }
      }
    }
  });
});
