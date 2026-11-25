/**
 * The game's data tables: what each file in data/ must contain, and `loadTables` that reads and
 * checks them all (docs/ARCHITECTURE.md, «Таблицы данных»).
 *
 *   data/balance.json    numbers of time, life, needs and choice (GDD §2.1, §2.3, §4.2, §13)
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
  ref,
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

/** A need of GDD §4.2: how fast it falls, how soon its absence kills. */
function need(doc: string, death: string) {
  return obj(
    {
      emptyDays: num({ min: 0.1, max: 100, unit: 'сут', doc: 'от 100 до 0 за' }),
      deathDays: num({
        min: 0.1,
        max: 100,
        unit: 'сут',
        doc: `на нуле здоровье от 100 до 0 (смерть — ${death}) за`,
      }),
    },
    { doc },
  );
}

/** A number per phase of the day: dawn, day, dusk, night. */
function phases(doc: string, unit: string, min: number, max: number) {
  const value = (phase: string) => num({ min, max, ...(unit ? { unit } : {}), doc: phase });
  return obj(
    { dawn: value('рассвет'), day: value('день'), dusk: value('закат'), night: value('ночь') },
    { doc },
  );
}

/** A number for each season of the year (GDD §3.2: spring, summer, autumn, winter). */
function seasons(doc: string, unit: string, min: number, max: number) {
  const value = (season: string) => num({ min, max, ...(unit ? { unit } : {}), doc: season });
  return obj(
    {
      spring: value('весна'),
      summer: value('лето'),
      autumn: value('осень'),
      winter: value('зима'),
    },
    { doc },
  );
}

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
      pathSearchTiles: int({
        min: 64,
        max: 1_048_576,
        unit: 'тайлов',
        doc: 'Поиск пути осматривает не больше стольких тайлов: дальняя или недостижимая цель не вешает игру (GDD §2.4)',
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
  villagers: obj(
    {
      wanderRadius: int({
        min: 1,
        max: 64,
        unit: 'тайлов',
        doc: 'Отдыхая, жители бродят не дальше этого от дома (точки старта)',
      }),
      restTicks: obj(
        {
          min: int({ min: 1, max: 4000, unit: 'тиков', doc: 'от' }),
          max: int({ min: 1, max: 4000, unit: 'тиков', doc: 'до' }),
        },
        {
          doc: 'Сколько житель стоит, прежде чем пойти дальше (40 тиков — 4 секунды на ×1)',
          check: (value) =>
            value.min <= value.max ? null : `«от» (${value.min}) больше, чем «до» (${value.max})`,
        },
      ),
      giveWayTicks: int({
        min: 1,
        max: 400,
        unit: 'тиков',
        doc: 'Сколько житель ждёт, когда другой освободит тайл на пути, прежде чем обойти его',
      }),
    },
    { doc: 'Жители: ходьба и отдых у дома (шаг 1.3)' },
  ),
  needs: obj(
    {
      food: need('Сытость', 'голод'),
      water: need('Жажда (100 — напился)', 'жажда'),
      sleep: obj(
        {
          emptyDays: num({ min: 0.1, max: 100, unit: 'сут', doc: 'от 100 до 0 за (не во сне)' }),
        },
        { doc: 'Сон (100 — выспался); на нуле не смерть, а обморок' },
      ),
      healDays: num({
        min: 0.1,
        max: 100,
        unit: 'сут',
        doc: 'Здоровье от 0 до 100 восстанавливается за столько суток, пока ни одна нужда не на нуле',
      }),
    },
    {
      doc: 'Потребности: шкалы 0–100, 100 — нужды нет (GDD §4.2; сытость и жажда — вдесятеро дольше, решение владельца, ADR-024)',
    },
  ),
  sleeping: obj(
    {
      fillDays: num({
        min: 0.01,
        max: 10,
        unit: 'сут',
        doc: 'Сон на лежанке (×1) восполняет шкалу от 0 до 100 за столько суток',
      }),
      groundFactor: num({
        min: 0.01,
        max: 2,
        unit: '×',
        doc: 'Сон на голой земле восполняет шкалу медленнее лежанки во столько раз (GDD §4.2: ×0,5)',
      }),
      faintWakePoints: num({
        min: 1,
        max: 100,
        unit: 'пунктов',
        doc: 'Упавший в обморок от недосыпа лежит, пока шкала сна не поднимется до стольких пунктов',
      }),
      factor: phases('Желание спать: нужда² умножается на', '×', 0, 20),
      wish: phases('…и к нему прибавляется (ночью — хочется спать, даже выспавшись)', '', 0, 5),
    },
    {
      doc: 'Сон: полезность «спать» = нужда² × множитель фазы суток + прибавка фазы (GDD §4.2)',
    },
  ),
  eating: obj(
    {
      rationPoints: num({
        min: 1,
        max: 100,
        unit: 'пунктов',
        doc: 'Насколько рацион утоляет голод. По GDD §13.2 рацион — еда на сутки, но сытость по решению владельца тянется вдесятеро дольше (ADR-024): рацион утоляет столько же, едят вдесятеро реже',
      }),
      biteRations: num({
        min: 0.01,
        max: 1,
        unit: 'рационов',
        doc: 'Сколько житель собирает с куста и съедает за раз',
      }),
      biteTicks: int({
        min: 1,
        max: 400,
        unit: 'тиков',
        doc: 'Сколько тиков уходит на одну горсть: собрать и съесть',
      }),
      sipPoints: num({
        min: 1,
        max: 100,
        unit: 'пунктов',
        doc: 'Насколько глоток утоляет жажду',
      }),
      sipTicks: int({ min: 1, max: 400, unit: 'тиков', doc: 'Сколько тиков длится глоток' }),
    },
    { doc: 'Еда и питьё (GDD §13.2)' },
  ),
  ai: obj(
    {
      thinkTicks: int({
        min: 1,
        max: 400,
        unit: 'тиков',
        doc: 'Житель обдумывает, что делать, раз в столько тиков — и за любым делом, со сдвигом между жителями (GDD §2.3: 5–20)',
      }),
      restUtility: num({
        min: 0.001,
        max: 1,
        doc: 'Полезность отдыха и прогулки у дома: нужда побеждает, когда нужда² × доступность больше (нужда 0…1)',
      }),
      halfAvailabilityTiles: num({
        min: 1,
        max: 10_000,
        unit: 'тайлов',
        doc: 'Доступность источника = 1 рядом и ½ на пути такой длины (тайлов травы): ближнее выбирают охотнее',
      }),
      jitterPercent: int({
        min: 0,
        max: 50,
        unit: '%',
        doc: 'Лёгкая случайность выбора: полезность каждого варианта умножается на 1 ± столько процентов',
      }),
      reservePoints: num({
        min: 0,
        max: 100,
        unit: 'пунктов',
        doc: 'Предусмотрительность: если другой нужды к возвращению из похода (туда, обратно и сама еда) останется меньше — сначала утолить её',
      }),
      retryTicks: int({
        min: 1,
        max: 4000,
        unit: 'тиков',
        doc: 'Искал, где утолить нужду, и не нашёл (ягоды кончились или всё слишком далеко), — снова ищет не раньше чем через столько',
      }),
      haulUtility: num({
        min: 0.001,
        max: 1,
        doc: 'Полезность работы «отнести в кучу» (шаг 1.7): работа × доступность (до предмета) против отдыха и нужд; выше отдыха — в свободное время носят',
      }),
      workRetryTicks: int({
        min: 1,
        max: 4000,
        unit: 'тиков',
        doc: 'Искал, что отнести в кучу, и не нашёл ничего близко — снова ищет не раньше чем через столько',
      }),
      keepMargin: num({
        min: 0,
        max: 10,
        doc: 'Упрямство (шаг 1.8): начатое дело (еда, питьё, работа) бросают ради другого, только если оно полезнее на эту долю (0,5 — в полтора раза): слегка голодный доделает работу, сильно голодный бросит всё',
      }),
      sleepHold: num({
        min: 0,
        max: 1,
        doc: 'Сон держится (шаг 1.8): встать ради другого можно, только если оно полезнее желания спать на столько — чтобы на закате, пока сон понемногу возвращается, не вставать и не ложиться по нескольку раз; припёрло (сильная жажда, голод) — встаёт',
      }),
      logSize: int({
        min: 1,
        max: 100,
        unit: 'решений',
        doc: 'Сколько последних решений помнит журнал решений жителя (отладка «Решения», шаг 1.8)',
      }),
    },
    { doc: 'Выбор действия: полезность = нужда² × доступность (GDD §2.3)' },
  ),
  items: obj(
    {
      pileRadius: int({
        min: 0,
        max: 5,
        unit: 'тайлов',
        doc: 'Куча у стоянки — квадрат тайлов с этим «радиусом» вокруг места кучи (1 — 3×3); в тайле — стопка одного ресурса',
      }),
      pileOffset: int({
        min: 1,
        max: 10,
        unit: 'тайлов',
        doc: 'Место кучи — на столько тайлов ниже (южнее) середины стоянки; середину оставляем костру',
      }),
      pickUpTicks: int({
        min: 1,
        max: 400,
        unit: 'тиков',
        doc: 'Сколько тиков житель подбирает стопку с земли',
      }),
      putDownTicks: int({
        min: 1,
        max: 400,
        unit: 'тиков',
        doc: 'Сколько тиков житель складывает ношу в кучу',
      }),
      gatherTiles: num({
        min: 0,
        max: 100,
        unit: 'тайлов',
        doc: 'Набирает охапку: если руки не полны и такой же предмет лежит не дальше (по пути), идёт за ним, а не в кучу',
      }),
      maxLoose: int({
        min: 0,
        max: 10_000,
        unit: 'стопок',
        doc: 'Больше стольких стопок на земле вне кучи не падает (не завалить карту, пока ничто не гниёт)',
      }),
      litterSpacing: int({
        min: 0,
        max: 20,
        unit: 'тайлов',
        doc: 'Ветки падают в стопку, уже лежащую рядом: не ближе стольких тайлов от другой стопки на земле — под деревьями копятся охапки, а не россыпь',
      }),
      startLitter: int({
        min: 0,
        max: 1000,
        unit: 'раз',
        doc: 'Сколько раз падали ветки до сотворения мира: на карте они уже лежат под деревьями',
      }),
      litterCheckTicks: int({
        min: 1,
        max: 400,
        unit: 'тиков',
        doc: 'Раз в столько тиков одно случайное дерево (из роняющих) может уронить ветки — с вероятностью, дающей каждому дереву средний срок litter.everyDays',
      }),
    },
    { doc: 'Предметы: стоянка, куча, ноша, падение веток (GDD §5.1, шаг 1.7)' },
  ),
  fire: obj(
    {
      fuelPerDay: seasons(
        'Костёр сжигает охапок (веток) в сутки (GDD §13.3: 1 летом, 3 зимой; охапка — одна ветка, ADR-029)',
        'охапок',
        0.01,
        20,
      ),
      maxFuel: int({
        min: 1,
        max: 20,
        unit: 'охапок',
        doc: 'Больше стольких охапок в костёр не положить: подкладывают понемногу, но регулярно',
      }),
      kindleBranches: int({
        min: 1,
        max: 10,
        unit: 'веток',
        doc: 'Развести огонь берутся, когда в куче лежит хотя бы столько веток',
      }),
      kindleTicks: int({
        min: 1,
        max: 400,
        unit: 'тиков',
        doc: 'Сколько тиков житель разводит огонь (складывает ветки, добывает огонь)',
      }),
      stokeTicks: int({
        min: 1,
        max: 400,
        unit: 'тиков',
        doc: 'Сколько тиков житель подкладывает дрова в горящий костёр',
      }),
      kindleUtility: num({
        min: 0.001,
        max: 2,
        doc: 'Полезность «развести огонь», пока костёр не горит, а в куче есть ветки (выше работы — огонь важнее)',
      }),
      stokeUtility: num({
        min: 0.001,
        max: 2,
        doc: 'Полезность «подложить дров» = это × (1 − дрова в костре / предел)²: чем меньше осталось, тем нужнее',
      }),
      eveningStoke: num({
        min: 1,
        max: 10,
        unit: '×',
        doc: 'Вечером (до ночи) «подложить дров» нужнее во столько раз: на ночь огонь заправляют',
      }),
      eveningWork: num({
        min: 0,
        max: 1,
        unit: '×',
        doc: 'Вечером, пока горит костёр, новая работа «отнести в кучу» полезна во столько раз меньше: в сумерках за ветками не ходят — садятся у огня (начатое доносят)',
      }),
      sitUtility: num({
        min: 0.001,
        max: 2,
        doc: 'Полезность «сидеть у огня» вечером и ночью, пока он горит (ночью сон сильнее); ниже упрямства работы — несущий ветки сначала донесёт их',
      }),
      eveningTicks: int({
        min: 0,
        max: 240,
        unit: 'тиков',
        doc: 'Вечер начинается за столько тиков до заката: с этого времени садятся у огня',
      }),
      nearTiles: int({
        min: 1,
        max: 5,
        unit: 'тайлов',
        doc: 'Сидят и спят у огня не дальше стольких тайлов от него (сбоку — лицом к огню)',
      }),
      sleepWalkTiles: int({
        min: 0,
        max: 200,
        unit: 'тайлов',
        doc: 'Спать идут к огню, если до него не дальше (тайлов травы); дальше — ложатся, где застала ночь',
      }),
      heatRadius: num({
        min: 1,
        max: 20,
        unit: 'тайлов',
        doc: 'Тепло горящего костра: полное рядом, слабеет до нуля на таком расстоянии (понадобится на шаге 1.10)',
      }),
      woodReserve: int({
        min: 0,
        max: 200,
        unit: 'веток',
        doc: 'Если в куче веток меньше, работа «отнести в кучу» полезнее — нужда в дровах',
      }),
      woodBoost: num({
        min: 0,
        max: 10,
        doc: 'Насколько полезнее работа при пустой куче: × (1 + это × нехватка), нехватка 0…1',
      }),
    },
    { doc: 'Костёр: дрова, огонь, вечер у огня (GDD §7.4, §13.3, шаг 1.9)' },
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
  pile: nullable(
    external(EXTERNAL_KINDS.sprite, 'спрайт', {
      doc: 'Как стопка выглядит в куче у стоянки: спрайт со ступенями размера — анимации small, medium и idle (полная стопка)',
    }),
    'в куче — тот же значок, сложенный по одному на каждую треть стопки',
  ),
  carry: nullable(
    external(EXTERNAL_KINDS.sprite, 'спрайт', {
      doc: 'Как ношу держат в руках: спрайт поверх жителя (руки — перекраска кожи жителя), точка привязки — на линии плеч',
    }),
    'в руках — значок ресурса над головой',
  ),
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
    harvest: nullable(
      obj(
        {
          food: ref('resources', { doc: 'Какая еда (ресурс категории «еда»)' }),
          rations: num({
            min: 0.25,
            max: 1000,
            unit: 'рационов',
            doc: 'Сколько её на объекте при сотворении мира',
          }),
          empty: id({ doc: 'Состояние, когда всё собрано (одно из states)' }),
        },
        {
          doc: 'Еда, которую собирают и съедают на месте (шаг 1.4): малина — ягоды; пока не возобновляется (шаг 1.11)',
        },
      ),
      'с объекта нечего собрать',
    ),
    litter: nullable(
      obj(
        {
          resource: ref('resources', { doc: 'Что падает (ресурс)' }),
          max: int({
            min: 1,
            max: 100,
            unit: 'шт.',
            doc: 'Сколько падает за раз: от 1 до стольких',
          }),
          everyDays: num({
            min: 1,
            max: 10_000,
            unit: 'сут',
            doc: 'В среднем раз в столько суток с одного объекта (если рядом есть свободный тайл)',
          }),
        },
        {
          doc: 'Что падает с объекта на соседний свободный тайл (шаг 1.7): дубы и берёзы роняют ветки',
        },
      ),
      'ничего не роняет',
    ),
  },
  {
    check: ({ states, place, weight, harvest }) => {
      if (new Set(states).size !== states.length) return 'состояния повторяются';
      if (place === null && weight !== 0) return 'вес без места (place) — должен быть 0';
      if (place !== null && weight === 0) return 'у объекта с местом (place) вес больше 0';
      if (harvest !== null && !states.includes(harvest.empty)) {
        return `состояние «${harvest.empty}» (harvest.empty) не из списка states: ${states.join(', ')}`;
      }
      if (harvest !== null && harvest.empty === states[0]) {
        return `harvest.empty не может быть начальным состоянием «${states[0]}» — объект появляется с едой`;
      }
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
