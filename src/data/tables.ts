/**
 * The game's data tables: what each file in data/ must contain, and `loadTables` that reads and
 * checks them all (docs/ARCHITECTURE.md, «Таблицы данных»).
 *
 *   data/balance.json    numbers of time and life (GDD §2.1, §13.1)
 *   data/resources.json  resources: food, materials, products (GDD §5.1, §5.2)
 *   data/terrain.json    types of ground: can one walk there, how fast (GDD §13.1, §6.1)
 *   data/objects.json    objects of the map: trees, bushes, boulders, flowers (GDD §2.2, §3.3)
 *
 * A new table: a schema here, an entry in TABLES, an import in ./index.ts. A new record of an
 * existing table needs no code at all.
 */
import {
  bool,
  DataError,
  deepFreeze,
  type ExternalRef,
  external,
  type Infer,
  id,
  int,
  list,
  nullable,
  num,
  obj,
  oneOf,
  readTables,
  type TableSchema,
  table,
  text,
} from './schema.ts';

/** Phases of a day, in order; a day starts with dawn (ADR-010). */
export const DAY_PHASES = ['dawn', 'day', 'dusk', 'night'] as const;
export type DayPhase = (typeof DAY_PHASES)[number];

/** Kinds of things the tables refer to outside src/data (checked by tests and the scene `data`). */
export const EXTERNAL_KINDS = {
  /** A sprite of src/art/sprites/ by name. */
  sprite: 'sprite',
  /** A look of the ground — an id of TERRAIN_LOOKS in src/art/terrain.ts. */
  terrainLook: 'terrain_look',
} as const;

function sum(values: Readonly<Record<string, number>>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function sharesOf100(what: string) {
  return (shares: Readonly<Record<string, number>>) => {
    const total = sum(shares);
    return total === 100 ? null : `${what} в сумме дают ${total} %, а нужно ровно 100 %`;
  };
}

const share = (doc: string) => int({ min: 1, max: 100, unit: '%', doc });

/** «From … to …» counts: the generator picks a number in between. */
function range(doc: string, min: number, max: number) {
  return obj(
    {
      min: int({ min, max, unit: 'шт.', doc: 'от' }),
      max: int({ min, max, unit: 'шт.', doc: 'до' }),
    },
    {
      doc,
      check: (value) =>
        value.min <= value.max ? null : `«от» (${value.min}) больше, чем «до» (${value.max})`,
    },
  );
}

// ── balance.json ───────────────────────────────────────────────────────────────────────────

const balanceSchema = obj({
  time: obj(
    {
      ticksPerSecond: int({
        min: 1,
        max: 100,
        unit: 'тиков/с',
        doc: 'Тиков симуляции в секунду на скорости ×1 (тик — 0,1 с)',
      }),
      ticksPerDay: int({
        min: 100,
        max: 100_000,
        unit: 'тиков',
        doc: 'Длина игровых суток: 400 тиков — 40 секунд на ×1',
      }),
      daysPerSeason: int({
        min: 1,
        max: 30,
        unit: 'сут',
        doc: 'Длина сезона; в году четыре сезона — весна, лето, осень, зима',
      }),
      phasePercent: obj(
        {
          dawn: share('Рассвет'),
          day: share('День'),
          dusk: share('Закат'),
          night: share('Ночь'),
        } satisfies Record<DayPhase, unknown>,
        {
          doc: 'Доли фаз суток; сутки начинаются с рассвета',
          check: sharesOf100('Доли фаз суток'),
        },
      ),
    },
    { doc: 'Время (GDD §2.1, §13.1)' },
  ),
  movement: obj(
    {
      walkTicksPerTile: int({
        min: 1,
        max: 100,
        unit: 'тиков',
        doc: 'За сколько тиков взрослый проходит тайл травы; на другой земле — делится на её скорость (terrain.json)',
      }),
    },
    { doc: 'Движение (GDD §13.1)' },
  ),
  life: obj(
    {
      dayPercent: obj(
        {
          work: share('Работа'),
          sleep: share('Сон'),
          leisure: share('Еда и досуг'),
        },
        {
          doc: 'Распорядок суток взрослого',
          check: sharesOf100('Доли распорядка суток'),
        },
      ),
      adultAge: int({ min: 10, max: 30, unit: 'лет', doc: 'Совершеннолетие' }),
      fertileAge: obj(
        {
          from: int({ min: 10, max: 60, unit: 'лет', doc: 'С' }),
          to: int({ min: 10, max: 60, unit: 'лет', doc: 'По' }),
        },
        {
          doc: 'Детородный возраст женщины',
          check: ({ from, to }) =>
            from < to ? null : `начало (${from}) должно быть раньше конца (${to})`,
        },
      ),
      pregnancySeasons: int({ min: 1, max: 8, unit: 'сезонов', doc: 'Беременность' }),
      minYearsBetweenChildren: int({
        min: 0,
        max: 10,
        unit: 'лет',
        doc: 'Минимальный перерыв между детьми',
      }),
    },
    { doc: 'Жизнь (GDD §13.1)' },
  ),
  map: obj(
    {
      width: int({ min: 16, max: 1024, unit: 'тайлов', doc: 'Ширина карты' }),
      height: int({ min: 16, max: 1024, unit: 'тайлов', doc: 'Высота карты' }),
      chunkSize: int({
        min: 8,
        max: 128,
        unit: 'тайлов',
        doc: 'Сторона чанка: карта рисуется и кешируется квадратами (GDD §2.2)',
      }),
      lakePercent: int({
        min: 0,
        max: 100,
        unit: '%',
        doc: 'Доля миров с озером вместо реки, пересекающей карту',
      }),
      forestPercent: int({ min: 5, max: 80, unit: '%', doc: 'Доля суши под лесом' }),
      bushes: range('Ягодных кустов на опушках (гарантия — не меньше нижнего числа)', 1, 200),
      boulders: range('Валунов', 0, 100),
      meadowDecorPercent: int({
        min: 0,
        max: 50,
        unit: '%',
        doc: 'Цветы и высокая трава: доля свободных тайлов луга',
      }),
      camp: obj(
        {
          size: int({ min: 3, max: 15, unit: 'тайлов', doc: 'сторона' }),
          waterDistance: int({ min: 1, max: 40, unit: 'тайлов', doc: 'до воды не дальше' }),
          forestDistance: int({ min: 1, max: 40, unit: 'тайлов', doc: 'до леса не дальше' }),
        },
        {
          doc: 'Сухое место под стоянку — квадрат суши без препятствий у воды и леса (GDD §3.1, п. 9)',
        },
      ),
    },
    {
      doc: 'Карта (GDD §2.2, §3.1, §3.3)',
      check: ({ width, height, chunkSize }) =>
        width % chunkSize === 0 && height % chunkSize === 0
          ? null
          : `стороны карты (${width}×${height}) должны делиться на сторону чанка (${chunkSize})`,
    },
  ),
});

export type Balance = Infer<typeof balanceSchema>;

// ── resources.json ─────────────────────────────────────────────────────────────────────────

/** Categories of resources (GDD §5.2). Mechanics depend on them: food is eaten. */
export const RESOURCE_CATEGORIES = ['food', 'material', 'product'] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

const resourcesSchema = table({
  id: id({ doc: 'Идентификатор: snake_case латиницей, на него ссылаются код и другие таблицы' }),
  name: text({ maxLength: 40, doc: 'Название для игрока' }),
  category: oneOf(RESOURCE_CATEGORIES, {
    names: { food: 'еда', material: 'материал', product: 'изделие' },
    doc: 'Категория (GDD §5.2)',
  }),
  era: int({
    min: 0,
    max: 5,
    doc: 'Эпоха, с которой ресурс встречается: 0 — стоянка … 5 — цивилизация',
  }),
  stack: int({
    min: 1,
    max: 1000,
    unit: 'шт.',
    doc: 'Стопка: столько лежит на одном тайле и столько уносят руки (GDD §5.1). Еда считается в рационах (§13.2)',
  }),
  spoilDays: nullable(
    num({
      min: 0.25,
      max: 1000,
      unit: 'сут',
      doc: 'Через сколько суток портится под навесом (GDD §5.1, §13.2)',
    }),
    'не портится',
  ),
  sprite: external(EXTERNAL_KINDS.sprite, 'спрайт', {
    doc: 'Спрайт: как стопка выглядит на земле, он же значок',
  }),
});

export type Resource = Infer<typeof resourcesSchema>[number];

// ── terrain.json ───────────────────────────────────────────────────────────────────────────

const terrainSchema = table(
  {
    id: id({ doc: 'Идентификатор типа земли' }),
    name: text({ maxLength: 40, doc: 'Название для игрока' }),
    look: external(EXTERNAL_KINDS.terrainLook, 'вид земли', {
      doc: 'Как земля выглядит: id вида из TERRAIN_LOOKS (src/art/terrain.ts) — тайлы, вариации, переходы',
    }),
    walkable: bool({ doc: 'Можно ли по ней ходить' }),
    speed: nullable(
      num({
        min: 0.1,
        max: 3,
        unit: '×',
        doc: 'Скорость ходьбы относительно травы: ×1 — тайл за walkTicksPerTile тиков (GDD §6.1)',
      }),
      'непроходимо',
    ),
  },
  {
    check: ({ walkable, speed }) => {
      if (walkable && speed === null) return 'у проходимой земли нужна скорость (speed)';
      if (!walkable && speed !== null) return 'у непроходимой земли скорость — null';
      return null;
    },
  },
);

export type Terrain = Infer<typeof terrainSchema>[number];

// ── objects.json ───────────────────────────────────────────────────────────────────────────

/**
 * Where the map generator puts an object (src/sim/mapgen.ts): in the forest, at its edge (berry
 * bushes), scattered over the land (boulders), on meadows (flowers). Mechanics depend on it.
 */
export const OBJECT_PLACES = ['forest', 'edge', 'scatter', 'meadow'] as const;
export type ObjectPlace = (typeof OBJECT_PLACES)[number];

const objectsSchema = table(
  {
    id: id({ doc: 'Идентификатор вида объекта; объекты на карте ссылаются на него' }),
    name: text({ maxLength: 40, doc: 'Название для игрока' }),
    sprite: external(EXTERNAL_KINDS.sprite, 'спрайт', {
      doc: 'Спрайт: как объект выглядит на карте',
    }),
    walkable: bool({
      doc: 'Можно ли пройти через тайл с этим объектом (цветы — да, дерево — нет)',
    }),
    states: list(id({ doc: 'Состояние' }), {
      min: 1,
      max: 16,
      doc: 'Состояния объекта, первое — начальное. Состояние рисуется анимацией спрайта с тем же именем (ягодный куст: ripe — с ягодами, empty — пустой), а если такой нет — первой анимацией',
    }),
    place: nullable(
      oneOf(OBJECT_PLACES, {
        names: { forest: 'лес', edge: 'опушка', scatter: 'россыпь', meadow: 'луг' },
        doc: 'Где объект появляется при сотворении карты',
      }),
      'не появляется при сотворении карты',
    ),
    weight: int({
      min: 0,
      max: 1000,
      doc: 'Как часто среди объектов того же места: дубов 56 на 26 берёз. 0 — если место не задано',
    }),
  },
  {
    check: ({ states, place, weight }) => {
      if (new Set(states).size !== states.length) return 'состояния повторяются';
      if (place === null && weight !== 0) return 'вес без места (place) — должен быть 0';
      if (place !== null && weight === 0) return 'у объекта с местом (place) вес больше 0';
      return null;
    },
  },
);

export type MapObjectDef = Infer<typeof objectsSchema>[number];

// ── All tables ─────────────────────────────────────────────────────────────────────────────

/** Every table: its file and schema. The scene `data` documents the tables from here. */
export const TABLES = {
  balance: { file: 'data/balance.json', schema: balanceSchema },
  resources: { file: 'data/resources.json', schema: resourcesSchema },
  terrain: { file: 'data/terrain.json', schema: terrainSchema },
  objects: { file: 'data/objects.json', schema: objectsSchema },
} as const satisfies Record<string, TableSchema<unknown>>;

export type TableName = keyof typeof TABLES;
/** Raw contents of the files, as parsed from JSON. */
export type RawTables = { readonly [K in TableName]: unknown };

/** A table of records with ids: in file order, and by id. */
export interface Table<T extends { readonly id: string }> {
  /** Records in the order of the file. */
  readonly records: readonly T[];
  has(id: string): boolean;
  /** The record with this id; an unknown id is a bug in the code, so it throws. */
  get(id: string): T;
}

function makeTable<T extends { readonly id: string }>(
  records: readonly T[],
  file: string,
): Table<T> {
  const byId = new Map(records.map((record) => [record.id, record]));
  return {
    records,
    has: (key) => byId.has(key),
    get(key) {
      const record = byId.get(key);
      if (!record) throw new Error(`Нет записи «${key}» в таблице ${file}`);
      return record;
    },
  };
}

export interface GameData {
  readonly balance: Balance;
  readonly resources: Table<Resource>;
  readonly terrain: Table<Terrain>;
  readonly objects: Table<MapObjectDef>;
  /**
   * References to sprites and looks of the ground. src/data cannot check them (it does not
   * import src/art): tests/data.test.ts and the scene `data` do, with `checkExternalRefs`.
   */
  readonly external: readonly ExternalRef[];
}

/**
 * Read and check all tables. Any problem — a missing or unknown field, a wrong type, a value
 * out of range, a repeated id, a reference to a missing record — throws a `DataError` that
 * lists every problem with its file, record and field. The result is frozen.
 */
export function loadTables(raw: RawTables): GameData {
  const { values, issues, external: refs } = readTables(TABLES, raw);
  if (issues.length > 0) throw new DataError(issues);
  return deepFreeze({
    balance: values.balance,
    resources: makeTable(values.resources, TABLES.resources.file),
    terrain: makeTable(values.terrain, TABLES.terrain.file),
    objects: makeTable(values.objects, TABLES.objects.file),
    external: refs,
  });
}
