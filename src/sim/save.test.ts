import { describe, expect, it } from 'vitest';
import { loadErrorText } from '../ui/texts.ts';
import { TICKS_PER_YEAR } from './calendar.ts';
import { hashState } from './hash.ts';
import {
  dataFingerprint,
  type LoadResult,
  loadWorld,
  SAVE_FORMAT,
  SAVE_VERSION,
  type SaveProblem,
  saveWorld,
} from './save.ts';
import { createWorld, runTicks, type World } from './world.ts';

function worldAt(seed: number, ticks: number): World {
  const world = createWorld(seed);
  runTicks(world, ticks);
  return world;
}

function loaded(result: LoadResult): World {
  if (!result.ok) throw new Error(`не загрузилось: ${JSON.stringify(result.error)}`);
  return result.world;
}

function problemOf(result: LoadResult): SaveProblem {
  if (result.ok) throw new Error('ожидалась ошибка, а сохранение загрузилось');
  expect(loadErrorText(result.error).length).toBeGreaterThan(10);
  return result.error.code;
}

/** A save as parsed JSON, loosely typed: tests break it on purpose. */
interface SaveJson {
  version?: unknown;
  seed: number;
  tick: number;
  hash?: string;
  data?: string;
  world?: unknown;
}

/** The world inside a parsed save, for edits. */
const worldIn = (save: SaveJson) => save.world as World & Record<string, unknown>;

/** Save text with its parsed JSON changed by `edit` (the hash is NOT recomputed). */
function edited(text: string, edit: (save: SaveJson) => void): string {
  const save = JSON.parse(text);
  edit(save);
  return JSON.stringify(save);
}

describe('сохранение и загрузка', () => {
  it('мир → текст → мир: тот же хэш и те же данные', () => {
    const world = worldAt(42, 7_000);
    const copy = loaded(loadWorld(saveWorld(world)));
    expect(hashState(copy)).toBe(hashState(world));
    expect(copy).toEqual(world);
  });

  it('сохранение начинается с заголовка: формат, версия, зерно, тик, хэш, отпечаток таблиц', () => {
    const world = worldAt(7, 9_000);
    const text = saveWorld(world);
    expect(text.startsWith(`{"format":"${SAVE_FORMAT}","version":${SAVE_VERSION},`)).toBe(true);
    const { world: _, ...header } = JSON.parse(text);
    expect(header).toEqual({
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      seed: 7,
      tick: 9_000,
      hash: hashState(world),
      data: dataFingerprint(),
    });
    const result = loadWorld(text);
    expect(result.ok && result.header).toEqual(header);
    expect(result.ok && result.warnings).toEqual([]);
  });

  it('сохранение не меняет мир и одинаково при повторе', () => {
    const world = worldAt(3, 2_500);
    const before = hashState(world);
    const text = saveWorld(world);
    expect(hashState(world)).toBe(before);
    expect(saveWorld(world)).toBe(text);
  });

  it('открывает сохранение, которое переформатировали (отступы, переносы строк)', () => {
    const world = worldAt(5, 1_234);
    const pretty = JSON.stringify(JSON.parse(saveWorld(world)), null, 2);
    expect(hashState(loaded(loadWorld(pretty)))).toBe(hashState(world));
  });

  it('типизированные массивы сохраняются байт в байт', () => {
    const world = worldAt(1, 10) as World & Record<string, unknown>;
    const big = new Uint16Array(70_000).map((_, i) => (i * 7919) % 65_536);
    Object.assign(world, {
      grid: {
        ground: new Uint8Array([0, 1, 2, 255]),
        clamped: new Uint8ClampedArray([0, 128, 255]),
        height: new Int16Array([-32768, -1, 0, 32767]),
        ids: new Int32Array([-1, 2_000_000_000]),
        mask: new Uint32Array([0, 0xffffffff]),
        wet: new Float32Array([0.1, -2.5, Number.NaN, 1e-30]),
        exact: new Float64Array([Math.PI, -0, 1e300]),
        small: new Int8Array([-128, 127]),
        empty: new Float64Array(0),
        // A view into the middle of a bigger buffer: only its own bytes are saved.
        slice: new Uint16Array([9, 8, 7, 6, 5]).subarray(1, 4),
        big,
      },
    });
    const copy = loaded(loadWorld(saveWorld(world))) as World & {
      grid: Record<string, ArrayLike<number>>;
    };
    expect(hashState(copy)).toBe(hashState(world));
    const { height, slice, wet, empty } = copy.grid;
    expect(height).toBeInstanceOf(Int16Array);
    expect(Array.from(height!)).toEqual([-32768, -1, 0, 32767]);
    expect(Array.from(slice!)).toEqual([8, 7, 6]);
    expect(Number.isNaN(wet![2])).toBe(true);
    expect(copy.grid.big).toEqual(big);
    expect(empty).toBeInstanceOf(Float64Array);
  });

  it('число, которое не сохранить (NaN, бесконечность), — ошибка с именем поля', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const world = worldAt(1, 10) as World & Record<string, unknown>;
      world.hunger = { level: bad };
      expect(() => saveWorld(world)).toThrow(/поле «level»/);
    }
  });

  it('не простые данные в мире — ошибка с путём', () => {
    const world = worldAt(1, 10);
    Object.assign(world.villagers.list[0]!, { memory: new Map() });
    expect(() => saveWorld(world)).toThrow(/villagers\.list\.0\.memory/);
  });
});

describe('плохие сохранения не роняют игру', () => {
  const text = saveWorld(worldAt(9, 3_000));

  it('пустое', () => {
    expect(problemOf(loadWorld(''))).toBe('empty');
    expect(problemOf(loadWorld('  \n '))).toBe('empty');
  });

  it('чужие файлы и чужой JSON', () => {
    for (const alien of [
      'привет, мир',
      '\x89PNG\r\n\x1a\n\0\0\0\rIHDR',
      '{"name": "другая игра", "level": 3}',
      '[1, 2, 3]',
      '"строка"',
      'null',
      '42',
      '{"format": "some-other-game/world", "version": 1}',
    ]) {
      expect(problemOf(loadWorld(alien)), alien).toBe('not_save');
    }
  });

  it('обрезанное', () => {
    for (const length of [20, 100, Math.floor(text.length / 2), text.length - 1]) {
      expect(problemOf(loadWorld(text.slice(0, length))), `${length} знаков`).toBe('damaged');
    }
  });

  it('изменённое: мир не сходится с контрольной суммой', () => {
    const changes: ((save: SaveJson) => void)[] = [
      (save) => {
        worldIn(save).events.list[5]!.tick += 1;
      },
      (save) => {
        worldIn(save).rng.fireflies.a ^= 1;
      },
      (save) => {
        worldIn(save).events.list.pop();
      },
      (save) => {
        worldIn(save).extra = true;
      },
      (save) => {
        save.hash = '0000000000000000';
      },
    ];
    for (const change of changes) {
      expect(problemOf(loadWorld(edited(text, change)))).toBe('damaged');
    }
  });

  it('заголовок не совпадает с миром или неполный', () => {
    const changes: ((save: SaveJson) => void)[] = [
      (save) => {
        save.tick += 1;
      },
      (save) => {
        save.seed = 10;
      },
      (save) => {
        delete save.hash;
      },
      (save) => {
        delete save.data;
      },
      (save) => {
        delete save.world;
      },
      (save) => {
        save.world = [1, 2];
      },
      (save) => {
        save.version = '1';
      },
      (save) => {
        save.version = 0;
      },
      (save) => {
        delete save.version;
      },
    ];
    for (const change of changes) {
      expect(problemOf(loadWorld(edited(text, change)))).toBe('damaged');
    }
  });

  it('испорченный типизированный массив', () => {
    const world = worldAt(1, 1) as World & Record<string, unknown>;
    world.grid = new Uint16Array([1, 2, 3]);
    const good = saveWorld(world);
    const bad = [
      good.replace(/"base64":"[^"]*"/, '"base64":"не base64!"'),
      good.replace(/"base64":"[^"]*"/, '"base64":"AQID"'), // 3 bytes — not whole Uint16 values
      good.replace('"$typed":"Uint16Array"', '"$typed":"Map"'),
    ];
    for (const text of bad) expect(problemOf(loadWorld(text))).toBe('damaged');
  });

  it('из более новой версии игры', () => {
    const newer = edited(text, (save) => {
      save.version = SAVE_VERSION + 1;
    });
    expect(problemOf(loadWorld(newer))).toBe('too_new');
  });

  it('из старой версии без переноса — отказ, с переносом — открывается', () => {
    const world = worldAt(4, 500);
    const old = saveWorld(world);
    expect(problemOf(loadWorld(old, { version: SAVE_VERSION + 1, migrations: {} }))).toBe(
      'too_old',
    );
    const result = loadWorld(old, {
      version: SAVE_VERSION + 2,
      migrations: {
        [SAVE_VERSION]: (w) => ({ ...w, weather: 'ясно' }),
        [SAVE_VERSION + 1]: (w) => ({
          ...w,
          weather: { sky: w.weather, wind: 0 },
        }),
      },
    });
    const upgraded = loaded(result) as World & Record<string, unknown>;
    expect(upgraded.weather).toEqual({ sky: 'ясно', wind: 0 });
    expect(upgraded.tick).toBe(500);
    expect(result.ok && result.header.version).toBe(SAVE_VERSION);
  });

  it('таблицы данных изменились после сохранения — предупреждение, а не отказ', () => {
    const other = edited(text, (save) => {
      save.data = '0123456789abcdef';
    });
    const result = loadWorld(other);
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings.map((w) => w.code)).toEqual(['data_changed']);
  });
});

// --- The shape of the world and the save format version -----------------------------------

/**
 * Every place in the world state with the kind of value found there: `events.list[].tick: number`.
 * Values of the discriminating fields `type` and `kind` are part of the shape (an event type
 * renamed is a change of format too).
 */
function shapeOf(value: unknown, path: string, out: Set<string>): void {
  const at = path === '' ? '(мир)' : path;
  if (value === null) {
    out.add(`${at}: null`);
  } else if (Array.isArray(value)) {
    out.add(`${at}: array`);
    for (const item of value) shapeOf(item, `${path}[]`, out);
  } else if (ArrayBuffer.isView(value)) {
    out.add(`${at}: ${value.constructor.name}`);
  } else if (typeof value === 'object') {
    out.add(`${at}: object`);
    for (const [key, item] of Object.entries(value)) {
      shapeOf(item, path === '' ? key : `${path}.${key}`, out);
    }
  } else if (typeof value === 'string' && /(^|\.)(type|kind)$/.test(path)) {
    out.add(`${at} = "${value}"`);
  } else {
    out.add(`${at}: ${typeof value}`);
  }
}

/**
 * Shape of a world over its first two years: sampled every 10 ticks, by day and by night, all event
 * types included — often enough to catch short actions (a walk to the water, a drink) that need
 * them only every few days (step 1.4, ADR-024). Two years since step 1.9: with the fire the first
 * meal of world 1 came after its first year.
 */
function sampleShape(): string[] {
  const out = new Set<string>();
  const world = createWorld(1);
  for (let tick = 0; tick <= 2 * TICKS_PER_YEAR; tick += 10) {
    shapeOf(world, '', out);
    runTicks(world, 10);
  }
  return [...out].sort();
}

/**
 * The shape of the world in the current save format version (SAVE_VERSION).
 *
 * The world changed shape (a new system, a new field, a renamed event)? Then old saves no longer
 * fit it. Do this, in the same step:
 *   1. raise SAVE_VERSION in ./save.ts;
 *   2. replace this list with the new one (the failing test prints it; the PR diff shows what changed);
 *   3. add a line to SHAPE_HISTORY below with the fingerprint the failing test prints;
 *   4. from stage 5 — add a migration from the old version to MIGRATIONS (./save.ts) and a test.
 */
const CURRENT_SHAPE: string[] = [
  '(мир): object',
  'camp.pile.x: number',
  'camp.pile.y: number',
  'camp.pile: object',
  'camp.x: number',
  'camp.y: number',
  'camp: object',
  'events.list: array',
  'events.list[].burned: number',
  'events.list[].cause.activity: string',
  'events.list[].cause.event: number',
  'events.list[].cause.kind = "decision"',
  'events.list[].cause.kind = "event"',
  'events.list[].cause.kind = "rule"',
  'events.list[].cause.rule: string',
  'events.list[].cause.villager: number',
  'events.list[].cause: object',
  'events.list[].count: number',
  'events.list[].day: number',
  'events.list[].distance: number',
  'events.list[].first: boolean',
  'events.list[].food: string',
  'events.list[].from: string',
  'events.list[].id: number',
  'events.list[].lit: number',
  'events.list[].object: number',
  'events.list[].phase: string',
  'events.list[].season: string',
  'events.list[].seed: number',
  'events.list[].sex: string',
  'events.list[].tick: number',
  'events.list[].to: string',
  'events.list[].type = "fire_lit"',
  'events.list[].type = "fire_out"',
  'events.list[].type = "fireflies_gone"',
  'events.list[].type = "fireflies_rose"',
  'events.list[].type = "food_found"',
  'events.list[].type = "phase_started"',
  'events.list[].type = "season_started"',
  'events.list[].type = "villager_arrived"',
  'events.list[].type = "weather_changed"',
  'events.list[].type = "world_created"',
  'events.list[].type = "year_started"',
  'events.list[].villager: number',
  'events.list[].x: number',
  'events.list[].y: number',
  'events.list[].year: number',
  'events.list[]: object',
  'events.nextId: number',
  'events: object',
  'fire.fed: number',
  'fire.fuel: number',
  'fire.lit: number',
  'fire.object: number',
  'fire.wet: number',
  'fire: object',
  'fireflies.nextId: number',
  'fireflies.swarm: array',
  'fireflies.swarm[].id: number',
  'fireflies.swarm[].lit: boolean',
  'fireflies.swarm[].prevX: number',
  'fireflies.swarm[].prevY: number',
  'fireflies.swarm[].vx: number',
  'fireflies.swarm[].vy: number',
  'fireflies.swarm[].x: number',
  'fireflies.swarm[].y: number',
  'fireflies.swarm[]: object',
  'fireflies: object',
  'items.burned: number',
  'items.list: array',
  'items.list[].count: number',
  'items.list[].id: number',
  'items.list[].place: string',
  'items.list[].resource: string',
  'items.list[].x: number',
  'items.list[].y: number',
  'items.list[]: object',
  'items.made: number',
  'items.nextId: number',
  'items.rotted: number',
  'items: object',
  'map.chunkSize: number',
  'map.fields: object',
  'map.ground: Uint8Array',
  'map.groundTypes: array',
  'map.groundTypes[]: string',
  'map.height: number',
  'map.object: Uint32Array',
  'map.width: number',
  'map: object',
  'objects.list: array',
  'objects.list[].def: string',
  'objects.list[].id: number',
  'objects.list[].state: string',
  'objects.list[].stock: number',
  'objects.list[].x: number',
  'objects.list[].y: number',
  'objects.list[]: object',
  'objects.nextId: number',
  'objects: object',
  'rng.fireflies.a: number',
  'rng.fireflies.b: number',
  'rng.fireflies.c: number',
  'rng.fireflies.d: number',
  'rng.fireflies: object',
  'rng.items.a: number',
  'rng.items.b: number',
  'rng.items.c: number',
  'rng.items.d: number',
  'rng.items: object',
  'rng.map.a: number',
  'rng.map.b: number',
  'rng.map.c: number',
  'rng.map.d: number',
  'rng.map: object',
  'rng.minds.a: number',
  'rng.minds.b: number',
  'rng.minds.c: number',
  'rng.minds.d: number',
  'rng.minds: object',
  'rng.villagers.a: number',
  'rng.villagers.b: number',
  'rng.villagers.c: number',
  'rng.villagers.d: number',
  'rng.villagers: object',
  'rng.weather.a: number',
  'rng.weather.b: number',
  'rng.weather.c: number',
  'rng.weather.d: number',
  'rng.weather: object',
  'rng: object',
  'seed: number',
  'tick: number',
  'villagers.list: array',
  'villagers.list[].action.bush: number',
  'villagers.list[].action.fainted: boolean',
  'villagers.list[].action.food: string',
  'villagers.list[].action.goal.x: number',
  'villagers.list[].action.goal.y: number',
  'villagers.list[].action.goal: object',
  'villagers.list[].action.item: number',
  'villagers.list[].action.kind = "drink"',
  'villagers.list[].action.kind = "eat"',
  'villagers.list[].action.kind = "idle"',
  'villagers.list[].action.kind = "kindle"',
  'villagers.list[].action.kind = "pick_up"',
  'villagers.list[].action.kind = "put_down"',
  'villagers.list[].action.kind = "sit"',
  'villagers.list[].action.kind = "sleep"',
  'villagers.list[].action.kind = "stoke"',
  'villagers.list[].action.kind = "take"',
  'villagers.list[].action.kind = "walk"',
  'villagers.list[].action.next: number',
  'villagers.list[].action.path: array',
  'villagers.list[].action.path[].x: number',
  'villagers.list[].action.path[].y: number',
  'villagers.list[].action.path[]: object',
  'villagers.list[].action.purpose: string',
  'villagers.list[].action.resource: string',
  'villagers.list[].action.source.item: number',
  'villagers.list[].action.source.kind = "bush"',
  'villagers.list[].action.source.kind = "fire"',
  'villagers.list[].action.source.kind = "item"',
  'villagers.list[].action.source.kind = "pile"',
  'villagers.list[].action.source.kind = "spot"',
  'villagers.list[].action.source.kind = "store"',
  'villagers.list[].action.source.kind = "water"',
  'villagers.list[].action.source.object: number',
  'villagers.list[].action.source.resource: string',
  'villagers.list[].action.source.x: number',
  'villagers.list[].action.source.y: number',
  'villagers.list[].action.source: null',
  'villagers.list[].action.source: object',
  'villagers.list[].action.until: number',
  'villagers.list[].action.waited: number',
  'villagers.list[].action.water.x: number',
  'villagers.list[].action.water.y: number',
  'villagers.list[].action.water: object',
  'villagers.list[].action: object',
  'villagers.list[].facing: string',
  'villagers.list[].hair: number',
  'villagers.list[].health: number',
  'villagers.list[].home.x: number',
  'villagers.list[].home.y: number',
  'villagers.list[].home: object',
  'villagers.list[].id: number',
  'villagers.list[].load.count: number',
  'villagers.list[].load.id: number',
  'villagers.list[].load.resource: string',
  'villagers.list[].load: null',
  'villagers.list[].load: object',
  'villagers.list[].log: array',
  'villagers.list[].log[].ahead: null',
  'villagers.list[].log[].ahead: string',
  'villagers.list[].log[].bar: null',
  'villagers.list[].log[].bar: number',
  'villagers.list[].log[].from: string',
  'villagers.list[].log[].options: array',
  'villagers.list[].log[].options[].current: boolean',
  'villagers.list[].log[].options[].kind = "drink"',
  'villagers.list[].log[].options[].kind = "eat"',
  'villagers.list[].log[].options[].kind = "haul"',
  'villagers.list[].log[].options[].kind = "kindle"',
  'villagers.list[].log[].options[].kind = "rest"',
  'villagers.list[].log[].options[].kind = "sit"',
  'villagers.list[].log[].options[].kind = "sleep"',
  'villagers.list[].log[].options[].kind = "stoke"',
  'villagers.list[].log[].options[].kind = "warm"',
  'villagers.list[].log[].options[].nowhere: boolean',
  'villagers.list[].log[].options[].searched: boolean',
  'villagers.list[].log[].options[].utility: number',
  'villagers.list[].log[].options[]: object',
  'villagers.list[].log[].plan: string',
  'villagers.list[].log[].tick: number',
  'villagers.list[].log[].utility: number',
  'villagers.list[].log[].why: string',
  'villagers.list[].log[]: object',
  'villagers.list[].needs.food: number',
  'villagers.list[].needs.sleep: number',
  'villagers.list[].needs.warmth: number',
  'villagers.list[].needs.water: number',
  'villagers.list[].needs: object',
  'villagers.list[].noWork: number',
  'villagers.list[].nowhere.food: number',
  'villagers.list[].nowhere.sleep: number',
  'villagers.list[].nowhere.warmth: number',
  'villagers.list[].nowhere.water: number',
  'villagers.list[].nowhere: object',
  'villagers.list[].plan.activity: string',
  'villagers.list[].plan.since: number',
  'villagers.list[].plan.steps: array',
  'villagers.list[].plan.steps[]: string',
  'villagers.list[].plan.utility: number',
  'villagers.list[].plan: object',
  'villagers.list[].prevX: number',
  'villagers.list[].prevY: number',
  'villagers.list[].progress: number',
  'villagers.list[].ranOut.food: number',
  'villagers.list[].ranOut.sleep: number',
  'villagers.list[].ranOut.warmth: number',
  'villagers.list[].ranOut.water: number',
  'villagers.list[].ranOut: object',
  'villagers.list[].sex: string',
  'villagers.list[].skin: number',
  'villagers.list[].thought: number',
  'villagers.list[].toX: number',
  'villagers.list[].toY: number',
  'villagers.list[].walked: number',
  'villagers.list[].x: number',
  'villagers.list[].y: number',
  'villagers.list[]: object',
  'villagers.nextId: number',
  'villagers: object',
  'weather.kind = "clear"',
  'weather.kind = "cloudy"',
  'weather.kind = "rain"',
  'weather.kind = "snow"',
  'weather.since: number',
  'weather.until: number',
  'weather: object',
];

/** Fingerprint of the shape of every save format version. Append only: never rewrite a line. */
const SHAPE_HISTORY: Record<number, string> = {
  1: '87ffb58acdf6e429', // step 0.7: calendar, journal, fireflies
  2: '98f2ff92c42e9236', // step 1.1: the map (ground and object layers) and its objects
  3: '6876adc0ecc30767', // step 1.3: villagers (walking, paths), their stream and arrival events
  4: '1af16d6fbdb44747', // step 1.4: needs, health, eating and drinking, berries on bushes, minds
  5: '5daf554442d2bbea', // step 1.5: sleep (need, action, faint); fireflies over the map
  6: '63b0fccd78514df5', // step 1.7: items (on tiles, in the hands), the camp, hauling, litter stream
  7: '5d50768a02d91b51', // step 1.8: plans of villagers and their journals of decisions
  8: 'a898a8e18ce492d8', // step 1.9: the campfire, burnt wood, tending the fire, sitting at it
  9: '4421a8b21c8842c5', // step 1.10: weather and its stream, warmth, a wet fire, rotting branches, food of a meal
  10: '567a017677412fd7', // step 1.11: the yearly crop, food found (how far from the camp)
};

describe('форма мира и версия формата сохранения', () => {
  const shape = sampleShape();
  const advice =
    'Форма мира изменилась — старые сохранения ей не подходят. Подними SAVE_VERSION в src/sim/save.ts ' +
    'и обнови CURRENT_SHAPE и SHAPE_HISTORY в src/sim/save.test.ts (порядок — в комментарии к CURRENT_SHAPE).';

  it('мир той же формы, что записана для текущей версии', () => {
    expect(shape, advice).toEqual(CURRENT_SHAPE);
  });

  it('отпечаток формы записан в историю под текущей версией', () => {
    expect(
      SHAPE_HISTORY[SAVE_VERSION],
      `${advice}\nОтпечаток формы для версии ${SAVE_VERSION}: ${hashState(shape)}`,
    ).toBe(hashState(CURRENT_SHAPE));
  });

  it('история версий без пропусков, у каждой версии своя форма', () => {
    const versions = Object.keys(SHAPE_HISTORY).map(Number);
    expect(versions).toEqual(Array.from({ length: SAVE_VERSION }, (_, i) => i + 1));
    expect(new Set(Object.values(SHAPE_HISTORY)).size).toBe(versions.length);
  });
});
