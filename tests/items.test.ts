/**
 * Items as physical things (step 1.7) — the criteria of the step as scenarios:
 *   - branches fall under trees, the villagers gather them and carry them to the pile at the camp:
 *     after a few days the pile holds at least so many;
 *   - conservation: over 10 000 ticks nothing is duplicated or lost — the items on tiles and in
 *     the hands always add up to all that fell (and the other invariants of items hold);
 *   - a load is let go, not lost: one who stops hauling (night, an order, death) leaves it on the
 *     ground, and it is carried on later.
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import { tickAt } from '../src/sim/calendar.ts';
import { hashState } from '../src/sim/hash.ts';
import {
  countAll,
  type Item,
  inPile,
  isPileTile,
  itemAt,
  lay,
  pileHasRoom,
  pileTiles,
  stackOf,
} from '../src/sim/items.ts';
import { loadWorld, saveWorld } from '../src/sim/save.ts';
import { orderWalk, removeVillager, type Villager } from '../src/sim/villagers.ts';
import { createWorld, runTicks, stepWorld, type World } from '../src/sim/world.ts';
import { brokenRules, meadow, worldOn } from './scenario.ts';

const DAY = DATA.balance.time.ticksPerDay;

/** A row of oaks along the top of a meadow: branches fall under them; the camp is in the middle. */
const EDGE = ['T'.repeat(24), ...meadow(24, 13)];

describe('критерий: ветки складываются в кучу у стоянки', () => {
  it('сценарий: опушка и луг — через 3 суток в куче не меньше 10 веток, всё по правилам', () => {
    const world = worldOn(EDGE);
    expect(world.items.made, 'под деревьями уже лежат ветки').toBeGreaterThan(0);
    expect(inPile(world, 'branches')).toBe(0);
    for (let tick = 0; tick < 3 * DAY; tick++) {
      stepWorld(world);
      expect(brokenRules(world)).toEqual([]);
    }
    // Gathered: what lies in the pile and what went from it into the fire (step 1.9).
    expect(inPile(world, 'branches') + world.items.burned).toBeGreaterThanOrEqual(10);
    // The pile lies where it should: by the camp, on its tiles.
    for (const item of world.items.list.filter((i) => i.place === 'pile')) {
      expect(Math.abs(item.x - world.camp.pile.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(item.y - world.camp.pile.y)).toBeLessThanOrEqual(1);
    }
  });

  it('20 миров: через 5 суток в куче не меньше 15 веток', () => {
    const piles: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld(seed);
      runTicks(world, 5 * DAY);
      // Gathered: in the pile and burnt from it (step 1.9: the fire takes its wood there).
      piles.push(inPile(world, 'branches') + world.items.burned);
    }
    expect(Math.min(...piles), `собрано: ${piles.join(', ')}`).toBeGreaterThanOrEqual(15);
  }, 60_000);

  it('куча растёт от середины: первая стопка — на месте кучи, полные стопки — по 10', () => {
    const world = createWorld(1);
    runTicks(world, 10 * DAY);
    const pile = world.items.list.filter((item) => item.place === 'pile');
    const first = pileTiles(world)[0]!;
    expect(first).toEqual(world.camp.pile);
    expect(pile.find((item) => item.x === first.x && item.y === first.y)?.count).toBe(10);
    // A begun stack is topped up first: at most one not full per carrier.
    expect(pile.filter((item) => item.count < stackOf('branches')).length).toBeLessThanOrEqual(2);
  });

  it('место кучи — у стоянки, ниже её середины, не на ней', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { camp } = createWorld(seed);
      expect(camp.pile.y, `зерно ${seed}`).toBeGreaterThan(camp.y);
      expect(camp.pile.y - camp.y, `зерно ${seed}`).toBeLessThanOrEqual(4);
      expect(Math.abs(camp.pile.x - camp.x), `зерно ${seed}`).toBeLessThanOrEqual(2);
    }
  });
});

describe('критерий: инвариант сохранения на 10 000 тиков', () => {
  it.each([1, 2, 3, 7, 92])(
    'зерно %i: ничего не дублируется и не пропадает',
    (seed) => {
      const world = createWorld(seed);
      let carried = 0;
      for (let tick = 0; tick < 10_000; tick++) {
        stepWorld(world);
        const broken = brokenRules(world);
        if (broken.length > 0) throw new Error(broken.join('; '));
        if (world.villagers.list.some((villager) => villager.load)) carried++;
      }
      // Something was really moved: half the time someone carries, the pile grew.
      expect(carried).toBeGreaterThan(1000);
      expect(inPile(world, 'branches')).toBeGreaterThan(0);
    },
    30_000,
  );
});

describe('гниение (шаг 1.10): старые охапки сгнивают, когда на земле их предел', () => {
  it('на земле maxLoose стопок — самая старая сгнивает, ветки падают дальше; учёт сходится', () => {
    const world = createWorld(86);
    // Seed 86: the camp is on the small side of a river, most branches fall across it.
    const { maxLoose } = DATA.balance.items;
    let full = false;
    for (let tick = 0; tick < 60 * DAY; tick++) {
      stepWorld(world);
      const loose = world.items.list.filter((item) => item.place === 'ground').length;
      expect(loose).toBeLessThanOrEqual(maxLoose);
      full ||= loose === maxLoose;
    }
    expect(full).toBe(true);
    expect(world.items.rotted).toBeGreaterThan(0);
    expect(brokenRules(world)).toEqual([]);
    // The oldest go first: every stack left is younger than the first that rotted would be.
    expect(world.items.list.filter((item) => item.place === 'ground')[0]!.id).toBeGreaterThan(1);
  }, 30_000);
});

describe('ноша не теряется', () => {
  /** A world where villager 1 has just picked up some branches and is setting off with them. */
  function carrying(): { world: World; man: Villager } {
    const world = worldOn(EDGE);
    for (let tick = 0; tick < DAY; tick++) {
      stepWorld(world);
      const man = world.villagers.list[0]!;
      if (man.load && man.action.kind === 'walk' && man.action.purpose === 'carry') {
        return { world, man };
      }
    }
    throw new Error('за сутки житель так и не понёс ветки');
  }

  it('бросил работу (послали в другое место): ноша ложится на землю той же стопкой, потом её уносят', () => {
    const { world, man } = carrying();
    const { id, count } = man.load!;
    expect(orderWalk(world, man, { x: man.x, y: man.y + 3 }).ok).toBe(true);
    stepWorld(world);
    expect(man.load).toBeNull();
    const dropped = world.items.list.find((item) => item.id === id) as Item;
    expect(dropped, 'ноша легла на землю той же стопкой').toBeDefined();
    expect(dropped.count).toBe(count);
    expect(brokenRules(world)).toEqual([]);
    // Later someone carries it to the pile after all (or it lay in the pile already).
    runTicks(world, DAY);
    const still = world.items.list.find((item) => item.id === id);
    expect(still === undefined || still.place === 'pile').toBe(true);
    expect(brokenRules(world)).toEqual([]);
  });

  it('ночь застала в пути: ложится спать, ноша — рядом на земле', () => {
    const world = worldOn(EDGE);
    // Run to the evening, then watch the first carrier lie down.
    runTicks(world, tickAt(1, 230));
    let slept = false;
    for (let tick = 0; tick < 200 && !slept; tick++) {
      stepWorld(world);
      expect(brokenRules(world)).toEqual([]);
      slept = world.villagers.list.every((villager) => villager.action.kind === 'sleep');
    }
    expect(slept).toBe(true);
    for (const villager of world.villagers.list) expect(villager.load).toBeNull();
  });

  it('умер с ношей — ветки остаются на земле', () => {
    const { world, man } = carrying();
    const before = countAll(world).branches;
    const { id } = man.load!;
    removeVillager(world, man.id);
    expect(countAll(world).branches).toBe(before);
    // On its tile: the same stack, or merged into the one that lay there.
    const there = world.items.list.find((item) => item.id === id) ?? itemAt(world, man.x, man.y);
    expect(there).toBeDefined();
    expect(brokenRules(world)).toEqual([]);
  });

  it('сохранение посреди переноски не меняет историю', () => {
    const history = (saveAt: number | null) => {
      let world = worldOn(EDGE);
      for (let tick = 0; tick < 2 * DAY; tick++) {
        if (tick === saveAt) {
          const loaded = loadWorld(saveWorld(world));
          if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
          world = loaded.world;
        }
        stepWorld(world);
      }
      return hashState(world);
    };
    const once = history(null);
    expect(history(null)).toBe(once);
    // Find a tick when someone carries, and save there.
    const probe = worldOn(EDGE);
    let at = 0;
    while (!probe.villagers.list.some((villager) => villager.load) && at < DAY) {
      stepWorld(probe);
      at++;
    }
    expect(at).toBeLessThan(DAY);
    expect(history(at)).toBe(once);
  });
});

describe('ветки падают под деревьями', () => {
  it('только на свободный тайл рядом с деревом, не в кучу; рядом с другой стопкой — не падают', () => {
    const world = worldOn(EDGE);
    runTicks(world, 5 * DAY);
    const spacing = DATA.balance.items.litterSpacing;
    const loose = world.items.list.filter((item) => item.place === 'ground');
    for (const item of loose) {
      expect(isPileTile(world, item.x, item.y)).toBe(false);
    }
    // Loose stacks keep apart — unless one was dropped from the hands (rare here).
    const close = loose.filter((a) =>
      loose.some(
        (b) => a !== b && Math.abs(a.x - b.x) <= spacing && Math.abs(a.y - b.y) <= spacing,
      ),
    );
    expect(close.length).toBeLessThanOrEqual(2);
  });

  it('без деревьев ничего не падает и никто не носит', () => {
    const world = worldOn(meadow(16, 10));
    runTicks(world, 2 * DAY);
    expect(world.items.made).toBe(0);
    expect(world.items.list).toEqual([]);
  });

  it('на карте лежит не больше items.maxLoose стопок вне кучи', () => {
    const world = createWorld(4);
    // Nobody gathers: the villagers are gone.
    for (const villager of [...world.villagers.list]) removeVillager(world, villager.id);
    runTicks(world, 40 * DAY);
    const loose = world.items.list.filter((item) => item.place === 'ground').length;
    expect(loose).toBeLessThanOrEqual(DATA.balance.items.maxLoose);
    expect(loose).toBeGreaterThan(DATA.balance.items.maxLoose / 2);
  }, 30_000);
});

describe('куча полна — работы нет', () => {
  it('в куче нет места: жители не берут ветки с земли', () => {
    const world = worldOn(EDGE);
    for (const tile of pileTiles(world)) {
      world.items.made += lay(world, 'branches', stackOf('branches'), tile.x, tile.y);
    }
    // The fire (step 1.9) takes wood from the pile and makes room in it: then work may start again.
    // While the pile is full, nobody sets off to carry anything lying loose to it.
    let full = 0;
    for (let tick = 0; tick < DAY; tick++) {
      const room = pileHasRoom(world, 'branches');
      if (!room) full++;
      stepWorld(world);
      for (const villager of world.villagers.list) {
        const chose = villager.log.at(-1);
        const hauls = chose?.tick === world.tick && chose.why === 'chose' && chose.plan === 'haul';
        if (!room)
          expect(
            hauls,
            `тик ${world.tick}: куча полна, а житель ${villager.id} взялся носить`,
          ).toBe(false);
      }
      expect(brokenRules(world)).toEqual([]);
    }
    expect(full, 'куча была полна').toBeGreaterThan(0);
  });
});
