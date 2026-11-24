/**
 * The utility mind with plans (step 1.8) — the criteria of the step as scenarios:
 *   - hysteresis: a villager carrying a load with satiety 60 carries it to the pile; with satiety 15
 *     drops it (the load stays on the ground) and goes to eat;
 *   - no twitching: in ordinary worlds a villager changes its plan seldom, and hardly ever turns
 *     straight back to the plan it has just left;
 *   - the journal of decisions explains every act: the plan under way is always the last decision
 *     on record, the step under way belongs to that plan, and every choice shows why it won;
 *   - every activity is a description with its plan, and a plan is carried out step by step.
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import { hashState } from '../src/sim/hash.ts';
import { findItem, inPile } from '../src/sim/items.ts';
import { ACTIVITY, type Activity, type Decision } from '../src/sim/minds.ts';
import { loadWorld, saveWorld } from '../src/sim/save.ts';
import type { Villager, VillagerAction } from '../src/sim/villagers.ts';
import { createWorld, runTicks, stepWorld, type World } from '../src/sim/world.ts';
import { brokenRules, meadow, worldOn } from './scenario.ts';

const DAY = DATA.balance.time.ticksPerDay;
const { thinkTicks, keepMargin, haulUtility, logSize } = DATA.balance.ai;

/** Oaks along the top (branches fall under them), a meadow, two berry bushes at the bottom right. */
const FIELD = [
  'T'.repeat(24),
  ...meadow(24, 11),
  `${'.'.repeat(20)}B...`,
  `${'.'.repeat(22)}B.`,
  '.'.repeat(24),
];

/** Step the world until `done` (at most `limit` ticks); true if it came. */
function runUntil(world: World, done: () => boolean, limit: number): boolean {
  for (let tick = 0; tick < limit; tick++) {
    if (done()) return true;
    stepWorld(world);
    const broken = brokenRules(world);
    if (broken.length > 0) throw new Error(broken.join('; '));
  }
  return done();
}

/** Is the villager on its way to the pile with a load? */
function carrying(villager: Villager): boolean {
  return (
    villager.load !== null && villager.action.kind === 'walk' && villager.action.purpose === 'carry'
  );
}

/** A world of FIELD where villager 1 is carrying its first load to the pile. */
function carrierWorld(): { world: World; villager: Villager } {
  const world = worldOn(FIELD);
  const villager = world.villagers.list[0]!;
  expect(
    runUntil(world, () => carrying(villager), DAY),
    'житель понёс ветки в кучу',
  ).toBe(true);
  return { world, villager };
}

describe('критерий: с ношей и сытостью 60 донесёт, с сытостью 15 бросит и пойдёт есть', () => {
  it('сытость 60: доносит ношу до кучи, на полпути есть не идёт', () => {
    const { world, villager } = carrierWorld();
    villager.needs.food = 60;
    const load = villager.load!.count;
    const before = inPile(world, 'branches');
    const since = villager.plan.since;
    expect(runUntil(world, () => villager.plan.activity !== 'haul', DAY)).toBe(true);
    // The plan was carried out to the end, not broken off.
    const done = villager.log.at(-1)!;
    expect(done).toMatchObject({ why: 'done', from: 'haul', plan: 'rest' });
    expect(villager.log.filter((d) => d.tick >= since && d.plan === 'eat')).toEqual([]);
    expect(inPile(world, 'branches')).toBeGreaterThanOrEqual(before + load);
    expect(villager.load).toBeNull();
  });

  it('сытость 15: бросает ношу на землю (той же стопкой) и идёт есть; потом ест', () => {
    const { world, villager } = carrierWorld();
    villager.needs.food = 15;
    const load = { ...villager.load! };
    // Within a moment of thought (a walker thinks at the first step after it).
    const soon = thinkTicks + 2 * DATA.balance.movement.walkTicksPerTile;
    expect(runUntil(world, () => villager.plan.activity !== 'haul', soon)).toBe(true);
    expect(villager.plan.activity).toBe('eat');
    expect(villager.action).toMatchObject({ kind: 'walk', purpose: 'eat' });
    // The load lies on the ground, the same stack.
    expect(villager.load).toBeNull();
    expect(findItem(world, load.id)).toMatchObject({ count: load.count, place: 'ground' });
    // The journal says why: hunger outbid the work by more than the hold of the plan.
    const decision = villager.log.at(-1)!;
    expect(decision).toMatchObject({ why: 'chose', from: 'haul', plan: 'eat' });
    expect(decision.bar).toBeCloseTo(haulUtility * (1 + keepMargin), 1);
    expect(decision.utility).toBeGreaterThan(decision.bar!);
    expect(decision.options.find((o) => o.current)).toMatchObject({ kind: 'haul' });
    expect(runUntil(world, () => villager.action.kind === 'eat', DAY)).toBe(true);
  });

  it('порог упрямства — в полтора раза: голод чуть сильнее работы её не прерывает', () => {
    // Satiety 45: eating is worth up to 0.30 (× availability, × the jitter up to 1.1) — more than
    // work (0.25), less than its hold (0.375). Carrying on.
    const { world, villager } = carrierWorld();
    villager.needs.food = 45;
    expect(0.55 * 0.55).toBeGreaterThan(haulUtility);
    expect(0.55 * 0.55 * 1.1).toBeLessThan(haulUtility * (1 + keepMargin));
    expect(runUntil(world, () => villager.plan.activity !== 'haul', DAY)).toBe(true);
    expect(villager.log.at(-1)).toMatchObject({ why: 'done', from: 'haul' });
  });
});

/** Every decision of every villager of a world run `ticks` from creation, in order. */
function decisionsOf(world: World, ticks: number, onTick?: () => void): Map<number, Decision[]> {
  const all = new Map<number, Decision[]>();
  const seen = new Map<number, number>();
  for (let tick = 0; tick < ticks; tick++) {
    stepWorld(world);
    onTick?.();
    for (const villager of world.villagers.list) {
      const last = seen.get(villager.id) ?? -1;
      const list = all.get(villager.id) ?? [];
      list.push(...villager.log.filter((decision) => decision.tick > last));
      all.set(villager.id, list);
      seen.set(villager.id, world.tick);
    }
  }
  return all;
}

describe('критерий: нет «дёрганья»', () => {
  it('10 миров × 10 суток: план по выбору — не чаще 6 раз в сутки, начатое бросают в основном на ночь, сразу назад — почти никогда', () => {
    const days = 10;
    let chosen = 0;
    let broken = 0;
    let brokenAwake = 0;
    let back = 0;
    let villagerDays = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const world = createWorld(seed);
      for (const decisions of decisionsOf(world, days * DAY).values()) {
        villagerDays += days;
        decisions.forEach((decision, i) => {
          if (decision.why !== 'chose') return;
          chosen++;
          // A begun meal, drink or work broken off: at nightfall — for sleep; otherwise — rare.
          if (decision.bar !== null && ACTIVITY[decision.from!].hold === 'firm') {
            broken++;
            if (decision.plan !== 'sleep') brokenAwake++;
          }
          // Straight back: X → Y and, within a few thoughts, Y → X again — both by choice.
          const before = decisions[i - 1];
          if (
            before?.why === 'chose' &&
            before.from === decision.plan &&
            before.plan === decision.from &&
            decision.tick - before.tick <= 5 * thinkTicks
          ) {
            back++;
          }
        });
      }
    }
    const perDay = (n: number) => n / villagerDays;
    const summary = `в сутки на жителя: выбор ${perDay(chosen).toFixed(2)}, прервано начатое ${perDay(broken).toFixed(2)} (не ради сна ${perDay(brokenAwake).toFixed(2)}), сразу назад ${perDay(back).toFixed(2)}`;
    expect(perDay(chosen), summary).toBeLessThanOrEqual(6);
    expect(perDay(broken), summary).toBeLessThanOrEqual(1.5);
    expect(perDay(brokenAwake), summary).toBeLessThanOrEqual(0.25);
    expect(perDay(back), summary).toBeLessThanOrEqual(0.25);
  }, 60_000);

  it('на закате не встают и не ложатся по нескольку раз', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const world = createWorld(seed);
      for (const [id, decisions] of decisionsOf(world, 5 * DAY)) {
        for (let day = 0; day < 5; day++) {
          const evening = decisions.filter(
            (d) =>
              d.why === 'chose' &&
              d.plan === 'sleep' &&
              d.tick >= day * DAY + 200 &&
              d.tick < (day + 1) * DAY,
          );
          expect(
            evening.length,
            `зерно ${seed}, житель ${id}, день ${day + 1}`,
          ).toBeLessThanOrEqual(2);
        }
      }
    }
  }, 60_000);
});

/** The steps a plan of each activity may be at (`action`), by kind and walk purpose. */
const STEPS_OF: Record<Activity, readonly string[]> = {
  rest: ['idle', 'walk:wander'],
  sleep: ['sleep'],
  eat: ['walk:eat', 'eat'],
  drink: ['walk:drink', 'drink'],
  haul: ['walk:fetch', 'pick_up', 'walk:carry', 'put_down'],
  order: ['walk:order'],
};

function stepName(action: VillagerAction): string {
  return action.kind === 'walk' ? `walk:${action.purpose}` : action.kind;
}

describe('критерий: по журналу решений можно объяснить любой поступок', () => {
  it('5 миров × 5 суток: план — последнее решение журнала, шаг — из этого плана, выбор — с причиной', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const world = createWorld(seed);
      const decisions = decisionsOf(world, 5 * DAY, () => {
        for (const villager of world.villagers.list) {
          const where = `зерно ${seed}, житель ${villager.id}, тик ${world.tick}`;
          const last = villager.log.at(-1);
          if (last) expect(last.plan, where).toBe(villager.plan.activity);
          else expect(villager.plan.activity, where).toBe('rest');
          expect(STEPS_OF[villager.plan.activity], where).toContain(stepName(villager.action));
          expect(villager.log.length).toBeLessThanOrEqual(logSize);
        }
      });
      for (const list of decisions.values()) {
        for (const decision of list) {
          if (decision.why !== 'chose') {
            expect(decision.options).toEqual([]);
            continue;
          }
          const where = `зерно ${seed}, тик ${decision.tick}: ${decision.from} → ${decision.plan}`;
          // The option that won: the plan itself, or the trip it went ahead of (precaution).
          const won = decision.ahead ?? decision.plan;
          const entry = decision.options.find((o) => o.kind === won && !o.current);
          expect(entry, where).toBeDefined();
          expect(entry!.utility, where).toBeCloseTo(decision.utility, 9);
          for (const other of decision.options) {
            if (other.current || other.kind === won) continue;
            expect(other.utility, where).toBeLessThanOrEqual(decision.utility);
          }
          if (decision.bar !== null) expect(decision.utility, where).toBeGreaterThan(decision.bar);
        }
      }
    }
  }, 60_000);

  it('журнал помнит последние ai.logSize решений; сохранение не меняет его и историю', () => {
    const world = createWorld(3);
    runTicks(world, 6 * DAY);
    for (const villager of world.villagers.list) {
      expect(villager.log).toHaveLength(logSize);
      const ticks = villager.log.map((d) => d.tick);
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    }
    const loaded = loadWorld(saveWorld(world));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
    expect(loaded.world.villagers.list.map((v) => v.log)).toEqual(
      world.villagers.list.map((v) => v.log),
    );
    runTicks(world, DAY);
    runTicks(loaded.world, DAY);
    expect(hashState(loaded.world)).toBe(hashState(world));
  });
});

describe('действия — описания с планами', () => {
  it('у каждого действия — потребность, полезность, упрямство и план из 1–5 шагов', () => {
    for (const activity of Object.values(ACTIVITY)) {
      expect(activity.steps.length).toBeGreaterThanOrEqual(1);
      expect(activity.steps.length).toBeLessThanOrEqual(5);
    }
    expect(ACTIVITY.haul.steps).toEqual(['fetch', 'pick_up', 'gather', 'carry', 'put_down']);
    expect(ACTIVITY.eat).toMatchObject({ need: 'food', hold: 'firm', steps: ['go', 'eat'] });
    expect(ACTIVITY.order).toMatchObject({ utility: null, hold: 'fixed' });
  });

  it('план работы идёт по шагам: дойти → поднять → (ещё) → донести → положить', () => {
    const { world, villager } = carrierWorld();
    const seen: string[] = [];
    const plan = villager.plan;
    expect(plan.steps).toEqual(['put_down']);
    runUntil(
      world,
      () => {
        const name = stepName(villager.action);
        if (seen.at(-1) !== name) seen.push(name);
        return villager.plan !== plan;
      },
      DAY,
    );
    expect(seen).toEqual(['walk:carry', 'put_down', 'idle']);
  });
});
