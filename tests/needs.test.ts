/**
 * Hunger and thirst (step 1.4) — the criteria of the step as scenarios:
 *   - on seeds 1…20 the two live 7 days and their needs never fall to zero;
 *   - without bushes a villager dies of hunger, the journal says «hunger»; without water — «thirst»;
 *   - a villager does not die while food and water are in reach (a mistake of the mind otherwise).
 * And the behaviour behind them: eating at a bush, drinking at the water, the choice between the
 * two, precaution before a long trip, two meeting head-on in a passage, one seed — one history.
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import type { WorldEvent } from '../src/sim/events.ts';
import { findEvent } from '../src/sim/events.ts';
import { hashState } from '../src/sim/hash.ts';
import { type Considered, choose, findSource } from '../src/sim/minds.ts';
import { FULL, fallPerTick, portionOf, satietyPerRation } from '../src/sim/needs.ts';
import { objectAt } from '../src/sim/objects.ts';
import { loadWorld, saveWorld } from '../src/sim/save.ts';
import { isStepping, orderWalk, type Villager } from '../src/sim/villagers.ts';
import { createWorld, runTicks, stepWorld, type World } from '../src/sim/world.ts';
import { worldOn } from './scenario.ts';

const DAY = DATA.balance.time.ticksPerDay;

function events<T extends WorldEvent['type']>(world: World, type: T) {
  return world.events.list.filter((e): e is Extract<WorldEvent, { type: T }> => e.type === type);
}

/** Run until everyone is dead or `ticks` pass; returns the ticks run. */
function runUntilAllDead(world: World, ticks: number): number {
  let run = 0;
  while (world.villagers.list.length > 0 && run < ticks) {
    stepWorld(world);
    run++;
  }
  return run;
}

describe('критерий: на зёрнах 1…20 двое живут 7 суток, нужды не падают до нуля', () => {
  // Since the owner's feedback (ADR-024) needs last ten times longer: a drink comes about every
  // week, a meal every ten days — so the worlds run 30 days, not 7, to see both eat and drink.
  it('30 суток (критерий — 7): ни одного нуля сытости и жажды, никто не умер, оба ели и пили', () => {
    const lowest: string[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld(seed);
      let food = FULL;
      let water = FULL;
      const ate = new Set<number>();
      const drank = new Set<number>();
      for (let tick = 0; tick < 30 * DAY; tick++) {
        stepWorld(world);
        for (const v of world.villagers.list) {
          food = Math.min(food, v.needs.food);
          water = Math.min(water, v.needs.water);
          if (v.action.kind === 'eat') ate.add(v.id);
          if (v.action.kind === 'drink') drank.add(v.id);
        }
      }
      expect(world.villagers.list, `зерно ${seed}: живы оба`).toHaveLength(2);
      expect(events(world, 'need_ran_out'), `зерно ${seed}`).toEqual([]);
      expect(food, `зерно ${seed}: сытость`).toBeGreaterThan(0);
      expect(water, `зерно ${seed}: жажда`).toBeGreaterThan(0);
      expect([...ate].sort(), `зерно ${seed}: ели оба`).toEqual([1, 2]);
      expect([...drank].sort(), `зерно ${seed}: пили оба`).toEqual([1, 2]);
      lowest.push(`${seed}: ${food.toFixed(0)}/${water.toFixed(0)}`);
    }
    // A margin, not a coincidence: the lowest scales stay well above zero.
    const worst = Math.min(
      ...lowest.map((line) => Math.min(...line.split(': ')[1]!.split('/').map(Number))),
    );
    expect(worst, lowest.join(', ')).toBeGreaterThan(5);
  }, 60_000);
});

describe('критерий: смерть от голода и от жажды — с причиной в журнале', () => {
  /** A meadow with a pond and no bushes at all. */
  const NO_BUSHES = [
    '............',
    '............',
    '....~~~.....',
    '....~~~.....',
    '............',
    '............',
  ];
  /** A meadow with bushes and not a drop of water. */
  const NO_WATER = [
    '............',
    '..B......B..',
    '............',
    '............',
    '.....B......',
    '............',
  ];

  it('без кустов: сытость кончается через 25 суток, смерть от голода ещё через 40', () => {
    const world = worldOn(NO_BUSHES, [
      { x: 1, y: 1 },
      { x: 10, y: 4 },
    ]);
    runUntilAllDead(world, 80 * DAY);
    expect(world.villagers.list).toEqual([]);
    const ranOut = events(world, 'need_ran_out');
    expect(ranOut.map((e) => e.need)).toEqual(['food', 'food']);
    for (const e of ranOut) {
      expect(e.tick).toBeGreaterThanOrEqual(25 * DAY - 2);
      expect(e.tick).toBeLessThanOrEqual(25 * DAY + 2);
      expect(e.cause).toEqual({ kind: 'need', villager: e.villager, need: 'food' });
    }
    const deaths = events(world, 'villager_died');
    expect(deaths).toHaveLength(2);
    for (const death of deaths) {
      expect(death).toMatchObject({ reason: 'hunger', foodReachable: false, waterReachable: true });
      // The chain «why?»: death ← hunger began ← the need itself.
      expect(death.cause.kind).toBe('event');
      const cause = death.cause.kind === 'event' ? findEvent(world, death.cause.event) : undefined;
      expect(cause).toMatchObject({ type: 'need_ran_out', villager: death.villager, need: 'food' });
      expect(death.tick - cause!.tick).toBeGreaterThanOrEqual(40 * DAY - 2);
      expect(death.tick - cause!.tick).toBeLessThanOrEqual(40 * DAY + 2);
    }
    // Thirst never ran out: the pond was there all along.
    expect(ranOut.some((e) => e.need === 'water')).toBe(false);
  });

  it('без воды: жажда кончается через 15 суток, смерть от жажды ещё через 20', () => {
    const world = worldOn(NO_WATER, [
      { x: 1, y: 2 },
      { x: 10, y: 3 },
    ]);
    runUntilAllDead(world, 50 * DAY);
    expect(world.villagers.list).toEqual([]);
    const deaths = events(world, 'villager_died');
    expect(deaths).toHaveLength(2);
    for (const death of deaths) {
      expect(death).toMatchObject({ reason: 'thirst', foodReachable: true, waterReachable: false });
      const cause = death.cause.kind === 'event' ? findEvent(world, death.cause.event) : undefined;
      expect(cause).toMatchObject({ type: 'need_ran_out', need: 'water' });
      expect(cause!.tick).toBeGreaterThanOrEqual(15 * DAY - 2);
      expect(cause!.tick).toBeLessThanOrEqual(15 * DAY + 2);
      expect(death.tick - cause!.tick).toBeGreaterThanOrEqual(20 * DAY - 2);
      expect(death.tick - cause!.tick).toBeLessThanOrEqual(20 * DAY + 2);
    }
    // They ate meanwhile: hunger never ran out.
    expect(events(world, 'need_ran_out').every((e) => e.need === 'water')).toBe(true);
  });
});

describe('критерий: житель не умирает при доступной еде и воде', () => {
  it('зёрна 1…20, ягод мало: всякая смерть — только когда еды или воды в досягаемости нет', () => {
    // Bushes do not grow back until step 1.11. With their own berries the two live some 25 years
    // (ADR-024); here every bush has a single handful, so they eat their reach bare within weeks
    // and die of hunger — lawfully. None may die with food and water in reach.
    const deaths: string[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld(seed);
      for (const object of world.objects.list) {
        if (object.stock > 0) object.stock = DATA.balance.eating.biteRations;
      }
      runUntilAllDead(world, 150 * DAY);
      for (const death of events(world, 'villager_died')) {
        deaths.push(`${seed}: ${death.reason}`);
        expect(
          death.foodReachable && death.waterReachable,
          `зерно ${seed}: ${JSON.stringify(death)}`,
        ).toBe(false);
      }
    }
    // The check is not empty: there were deaths, all of hunger with the berries gone.
    expect(deaths.length).toBeGreaterThan(4);
    expect(deaths.every((line) => line.endsWith('hunger'))).toBe(true);
  }, 60_000);

  it('еды вдоволь и вода рядом: 150 суток без единого нуля', () => {
    const rows = [
      '..B....................B..',
      '..........................',
      '.......~~~~~~.............',
      '.......~~~~~~.......B.....',
      '..........................',
      '.B..............B.........',
      '..........................',
      '...........B..........B...',
    ];
    const world = worldOn(rows, [
      { x: 4, y: 4 },
      { x: 14, y: 4 },
    ]);
    // Plenty of berries on every bush: the scales go round many times — a meal every ten days.
    for (const object of world.objects.list) object.stock = 100;
    runTicks(world, 150 * DAY);
    expect(world.villagers.list).toHaveLength(2);
    expect(events(world, 'need_ran_out')).toEqual([]);
    for (const v of world.villagers.list) expect(v.health).toBe(FULL);
  });
});

describe('у куста и у воды', () => {
  it('голодный идёт к кусту, встаёт рядом лицом к нему и ест, пока не наестся', () => {
    const world = worldOn(
      ['..........', '.......B..', '..........', '..........'],
      [
        { x: 1, y: 1 },
        { x: 1, y: 3 },
      ],
    );
    const [man, woman] = world.villagers.list as [Villager, Villager];
    woman.action = { kind: 'idle', until: Number.MAX_SAFE_INTEGER };
    man.needs.food = 30;
    const bush = objectAt(world.map, world.objects, 7, 1)!;
    let ate = false;
    let gained = 0;
    for (let tick = 0; tick < 400 && !(ate && man.action.kind !== 'eat'); tick++) {
      const before = man.needs.food;
      stepWorld(world);
      // A bite: the tick's fall and the satiety of the berries.
      if (man.needs.food > before) gained += man.needs.food - before + fallPerTick('food');
      if (man.action.kind === 'eat') {
        ate = true;
        // Beside the bush, on one of its four sides, facing it.
        expect(Math.abs(man.x - 7) + Math.abs(man.y - 1)).toBe(1);
        expect(isStepping(man)).toBe(false);
        expect({ w: 'e', e: 'w', n: 's', s: 'n' }[man.facing]).toBeDefined();
        const toBush = { dx: 7 - man.x, dy: 1 - man.y };
        expect(man.facing).toBe(
          toBush.dx > 0 ? 'e' : toBush.dx < 0 ? 'w' : toBush.dy > 0 ? 's' : 'n',
        );
      }
    }
    expect(ate).toBe(true);
    expect(man.needs.food).toBeGreaterThan(FULL - portionOf('food'));
    // Berries came off the bush, no more and no fewer than were eaten — whole bites.
    const eaten = 4 - bush.stock;
    expect(gained).toBeCloseTo(eaten * satietyPerRation(), 9);
    // 30 → above 90: seven handfuls of 10 (satiety hardly falls on the way since ADR-024).
    expect(eaten / DATA.balance.eating.biteRations).toBe(7);
    expect(bush.state).toBe('ripe');
  });

  it('обобранный куст пустеет; голодный идёт к следующему', () => {
    const world = worldOn(
      ['.B..........B.', '..............', '..............'],
      [
        { x: 1, y: 1 },
        { x: 13, y: 2 },
      ],
    );
    const [man, woman] = world.villagers.list as [Villager, Villager];
    woman.action = { kind: 'idle', until: Number.MAX_SAFE_INTEGER };
    const near = objectAt(world.map, world.objects, 1, 0)!;
    const far = objectAt(world.map, world.objects, 12, 0)!;
    near.stock = 0.5;
    man.needs.food = 10;
    for (let tick = 0; tick < 600 && man.needs.food < 90; tick++) stepWorld(world);
    expect(near).toMatchObject({ stock: 0, state: 'empty' });
    expect(far.stock).toBeLessThan(4);
    expect(man.needs.food).toBeGreaterThan(90);
    // The satiety gained is the berries taken: a ration is a day's food.
    expect((4 - far.stock + 0.5) * satietyPerRation()).toBeGreaterThanOrEqual(80);
  });

  it('жаждущий идёт к кромке воды и пьёт, пока не напьётся', () => {
    const world = worldOn(
      ['..........', '..........', '.......~~~', '.......~~~'],
      [
        { x: 0, y: 0 },
        { x: 0, y: 3 },
      ],
    );
    const [man, woman] = world.villagers.list as [Villager, Villager];
    woman.action = { kind: 'idle', until: Number.MAX_SAFE_INTEGER };
    man.needs.water = 20;
    let drank = false;
    for (let tick = 0; tick < 300 && !(drank && man.action.kind !== 'drink'); tick++) {
      stepWorld(world);
      if (man.action.kind === 'drink') {
        drank = true;
        const { water } = man.action;
        expect(Math.abs(water.x - man.x) + Math.abs(water.y - man.y)).toBe(1);
        expect(world.map.ground[water.y * world.map.width + water.x]).not.toBe(
          world.map.groundTypes.indexOf('grass'),
        );
      }
    }
    expect(drank).toBe(true);
    expect(man.needs.water).toBeGreaterThan(FULL - portionOf('water'));
  });
});

describe('выбор: нужда² × доступность', () => {
  /** Water at the left edge, a bush far to the right. */
  const FAR = [
    '~...........................................B.',
    '~.............................................',
  ];

  function villagerAt(needs: { food: number; water: number; sleep?: number }) {
    const world = worldOn(FAR, [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    const villager = world.villagers.list[0]!;
    villager.needs = { sleep: FULL, ...needs };
    return { world, villager };
  }

  it('сытый и напившийся отдыхает и даже не ищет', () => {
    const { world, villager } = villagerAt({ food: 95, water: 95 });
    const considered: Considered[] = [];
    expect(choose(world, villager, considered).kind).toBe('rest');
    expect(considered.every((option) => !option.searched)).toBe(true);
  });

  it('что сильнее — то и выбирает; при равной нужде — ближнее', () => {
    expect(
      choose(...(Object.values(villagerAt({ food: 90, water: 30 })) as [World, Villager])).kind,
    ).toBe('drink');
    // Equally hungry and thirsty: the water is beside him, the bush 43 tiles away.
    const both = villagerAt({ food: 30, water: 30 });
    expect(choose(both.world, both.villager).kind).toBe('drink');
  });

  it('предусмотрительность: перед дальним походом за ягодами сначала пьёт', () => {
    // Starving, rather thirsty: the berries win on their own…
    const hungry = villagerAt({ food: 0, water: 30 });
    const considered: Considered[] = [];
    const choice = choose(hungry.world, hungry.villager, considered);
    expect(considered.find((option) => option.kind === 'eat')!.utility).toBeGreaterThan(
      considered.find((option) => option.kind === 'drink')!.utility,
    );
    // …but there and back is ~85 tiles, and the meal: thirst would fall below the reserve (25) —
    // drink first.
    expect(choice.kind).toBe('drink');
    // Full of water already: there is nothing to top up, he goes for the berries.
    const sated = villagerAt({ food: 0, water: 95 });
    expect(choose(sated.world, sated.villager).kind).toBe('eat');
  });

  it('источник — ближайший по пути; занятое место не выбирает', () => {
    const world = worldOn(
      ['B.........B', '...........', '...........'],
      [
        { x: 3, y: 2 },
        { x: 1, y: 0 },
      ],
    );
    const [man] = world.villagers.list as [Villager, Villager];
    const found = findSource(world, man, 'food');
    // The left bush is nearer, but its only free side (1, 0) is taken by the woman.
    expect(found?.source).toMatchObject({ kind: 'bush', x: 0, y: 0 });
    expect(found?.goal).toEqual({ x: 0, y: 1 });
  });
});

describe('двое встречаются лоб в лоб', () => {
  it('в кольце из двух проходов: один уступает и обходит, оба доходят', () => {
    const RING = ['.............', '.TTTTTTTTTTT.', '.............'];
    const world = worldOn(RING, [
      { x: 3, y: 0 },
      { x: 10, y: 0 },
    ]);
    const [man, woman] = world.villagers.list as [Villager, Villager];
    // Each goes along the upper passage towards the other's place.
    expect(orderWalk(world, man, { x: 11, y: 0 }).ok).toBe(true);
    expect(orderWalk(world, woman, { x: 2, y: 0 }).ok).toBe(true);
    let ticks = 0;
    const arrived = (v: Villager, x: number) => v.x === x && v.y === 0 && !isStepping(v);
    let both = false;
    while (!both && ticks < 600) {
      stepWorld(world);
      ticks++;
      both = arrived(man, 11) && arrived(woman, 2);
    }
    expect(arrived(man, 11), `мужчина в (${man.x}, ${man.y})`).toBe(true);
    expect(arrived(woman, 2), `женщина в (${woman.x}, ${woman.y})`).toBe(true);
    // The way round the ring is ~30 tiles: well within 600 ticks, no going round in circles.
    expect(ticks).toBeLessThan(300);
  });
});

describe('детерминизм с нуждами', () => {
  it('одно зерно — одна история; сохранение посреди еды её не меняет', () => {
    const history = (saveAt: number | null) => {
      let world = createWorld(5);
      for (let tick = 0; tick < 4 * DAY; tick++) {
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
    // Find a tick when someone is eating, and save there.
    const world = createWorld(5);
    while (!world.villagers.list.some((v) => v.action.kind === 'eat')) stepWorld(world);
    expect(history(world.tick)).toBe(once);
  });
});
