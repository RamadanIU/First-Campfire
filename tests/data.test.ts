/**
 * The data tables as a whole, together with what they refer to outside src/data: sprites and
 * looks of the ground (src/art). src/data cannot import src/art, so these references are checked
 * here — a resource pointing to a sprite that does not exist fails with the file, record and
 * field named. And the promise of step 0.5: a new record in a table shows up in the scene
 * `data` without touching the code.
 */
import { describe, expect, it } from 'vitest';
import { checkDataRefs } from '../src/app/dataRefs.ts';
import { balanceGroups, objectRows, resourceGroups, terrainRows } from '../src/app/dataScene.ts';
import { SPRITES } from '../src/art/registry.ts';
import { TERRAIN_LOOKS } from '../src/art/terrain.ts';
import { DATA, RAW_TABLES } from '../src/data/index.ts';
import { formatIssue } from '../src/data/schema.ts';
import { loadTables, type RawTables } from '../src/data/tables.ts';

type Json = Record<string, unknown>;

/** A copy of the real tables with some change. */
function tablesWith(
  change: (tables: { resources: Json[]; terrain: Json[]; objects: Json[] }) => void,
) {
  const copy = structuredClone(RAW_TABLES) as {
    resources: Json[];
    terrain: Json[];
    objects: Json[];
  };
  change(copy);
  return loadTables(copy as unknown as RawTables);
}

describe('таблицы данных целиком', () => {
  it('ссылки на спрайты и виды земли существуют', () => {
    expect(checkDataRefs(DATA).map(formatIssue)).toEqual([]);
    // Every resource names its sprite, and the ones with a pile or a carried look — those too (1.7).
    const piles = DATA.resources.records.filter((resource) => resource.pile !== null).length;
    const carried = DATA.resources.records.filter((resource) => resource.carry !== null).length;
    expect(DATA.external.length).toBe(
      DATA.resources.records.length +
        piles +
        carried +
        DATA.terrain.records.length +
        DATA.objects.records.length,
    );
  });

  it('объект карты — спрайт вида «объект»; несколько состояний — анимации спрайта', () => {
    const sprites = new Map(SPRITES.map((sprite) => [sprite.name, sprite]));
    for (const def of DATA.objects.records) {
      const sprite = sprites.get(def.sprite)!;
      expect(sprite.kind, def.id).toBe('object');
      // A state is shown by the animation of the same name; one state may use the default one.
      if (def.states.length > 1) {
        for (const state of def.states)
          expect(Object.keys(sprite.animations), def.id).toContain(state);
      }
    }
  });

  it('ссылка объекта на несуществующий спрайт — понятная ошибка', () => {
    const data = tablesWith((t) => {
      t.objects.find((r) => r.id === 'oak')!.sprite = 'tre';
    });
    expect(checkDataRefs(data).map(formatIssue)).toEqual([
      'data/objects.json · запись «oak» · поле «sprite»: ссылка на несуществующий спрайт «tre» — может быть, «tree»?',
    ]);
  });

  it('у генератора карты есть всё нужное: деревья, кусты, камни, цветы', () => {
    const places = new Set(DATA.objects.records.map((def) => def.place));
    expect([...places].sort()).toEqual(['edge', 'forest', 'meadow', 'scatter']);
    expect(DATA.objects.get('oak')).toMatchObject({ walkable: false, place: 'forest' });
    expect(DATA.objects.get('berry_bush').states).toEqual(['ripe', 'empty']);
    expect(DATA.objects.get('flowers').walkable).toBe(true);
  });

  it('ссылка на несуществующий спрайт — понятная ошибка', () => {
    const data = tablesWith((t) => {
      t.resources.find((r) => r.id === 'berries')!.sprite = 'berris';
    });
    expect(checkDataRefs(data).map(formatIssue)).toEqual([
      'data/resources.json · запись «berries» · поле «sprite»: ссылка на несуществующий спрайт «berris» — может быть, «berries»?',
    ]);
  });

  it('ссылка на несуществующий вид земли — понятная ошибка', () => {
    const data = tablesWith((t) => {
      t.terrain.find((r) => r.id === 'sand')!.look = 'mud';
    });
    expect(checkDataRefs(data).map(formatIssue)).toEqual([
      'data/terrain.json · запись «sand» · поле «look»: ссылка на несуществующий вид земли «mud»',
    ]);
  });

  it('спрайт ресурса — предмет (или объект на земле, как ветки)', () => {
    const kinds = new Map(SPRITES.map((sprite) => [sprite.name, sprite.kind]));
    for (const resource of DATA.resources.records) {
      expect(['item', 'object'], resource.id).toContain(kinds.get(resource.sprite));
    }
  });

  it('у каждого спрайта-предмета есть ресурс, у каждого вида земли — тип земли', () => {
    const used = new Set(DATA.resources.records.map((r) => r.sprite));
    const orphans = SPRITES.filter((s) => s.kind === 'item' && !used.has(s.name));
    expect(orphans.map((s) => s.name)).toEqual([]);
    const looks = new Set(DATA.terrain.records.map((t) => t.look));
    expect(TERRAIN_LOOKS.filter((look) => !looks.has(look.id)).map((l) => l.id)).toEqual([]);
  });

  it('все ресурсы эпохи 0 из GDD §5.2: 10 видов еды, 12 материалов, 11 изделий', () => {
    const epoch0 = DATA.resources.records.filter((r) => r.era === 0);
    const count = (category: string) => epoch0.filter((r) => r.category === category).length;
    expect([count('food'), count('material'), count('product')]).toEqual([10, 12, 11]);
    // Numbers given by GDD §13.2: berries 3 days, meat and fish 2, roots one season (3 days).
    expect(DATA.resources.get('berries').spoilDays).toBe(3);
    expect(DATA.resources.get('meat').spoilDays).toBe(2);
    expect(DATA.resources.get('fish').spoilDays).toBe(2);
    expect(DATA.resources.get('roots').spoilDays).toBe(DATA.balance.time.daysPerSeason);
  });

  it('вода непроходима, трава — эталон скорости (шаг 1.3)', () => {
    expect(DATA.terrain.get('grass')).toMatchObject({ walkable: true, speed: 1 });
    for (const water of ['shallow_water', 'deep_water']) {
      expect(DATA.terrain.get(water)).toMatchObject({ walkable: false, speed: null });
    }
  });
});

describe('сцена data показывает таблицы как есть', () => {
  it('новая запись в resources.json видна в сцене без правки кода', () => {
    const data = tablesWith((t) => {
      t.resources.push({
        id: 'acorns',
        name: 'Жёлуди',
        category: 'food',
        era: 0,
        stack: 5,
        spoilDays: 6.5,
        pile: null,
        carry: null,
        sprite: 'nuts',
      });
    });
    expect(checkDataRefs(data)).toEqual([]);
    const food = resourceGroups(data).find((group) => group.category === 'food')!;
    expect(food.rows.at(-1)).toEqual({
      id: 'acorns',
      name: 'Жёлуди',
      sprite: 'nuts',
      stack: '5 рационов',
      spoils: '6,5 сут',
      era: '0',
    });
    expect(food.rows).toHaveLength(11);
  });

  it('ресурсы по категориям, в порядке файла', () => {
    const groups = resourceGroups(DATA);
    expect(groups.map((g) => [g.title, g.rows.length])).toEqual([
      ['Еда', 10],
      ['Материалы', 12],
      ['Изделия', 11],
    ]);
    expect(groups[0]!.rows[0]).toEqual({
      id: 'berries',
      name: 'Ягоды',
      sprite: 'berries',
      stack: '2 рациона',
      spoils: '3 сут',
      era: '0',
    });
    expect(groups[0]!.rows.find((r) => r.id === 'wild_honey')!.spoils).toBe('не портится');
    expect(groups[1]!.rows[0]!.stack).toBe('10 шт.');
  });

  it('земля: скорость и сколько тиков на тайл', () => {
    expect(terrainRows(DATA).map((r) => [r.id, r.walkable, r.speed, r.ticksPerTile])).toEqual([
      ['grass', 'да', '×1', '4 тика'],
      ['dirt', 'да', '×1,1', '3,6 тика'],
      ['sand', 'да', '×0,8', '5 тиков'],
      ['shallow_water', 'нет', '—', '—'],
      ['deep_water', 'нет', '—', '—'],
    ]);
  });

  it('объекты карты: проходимость, состояния, место генератора', () => {
    const rows = objectRows(DATA);
    expect(rows.map((r) => r.id)).toEqual(DATA.objects.records.map((d) => d.id));
    expect(rows.find((r) => r.id === 'berry_bush')).toEqual({
      id: 'berry_bush',
      name: 'Малина',
      sprite: 'berry_bush',
      walkable: 'нет',
      states: 'ripe → empty',
      place: 'опушка · вес 1',
      harvest: 'Ягоды · 4 рациона → empty',
    });
    expect(rows.find((r) => r.id === 'oak')!.harvest).toBe('—');
    // What is gathered and eaten on the spot is food.
    for (const def of DATA.objects.records) {
      if (def.harvest) expect(DATA.resources.get(def.harvest.food).category, def.id).toBe('food');
    }
    expect(rows.find((r) => r.id === 'flowers')!.walkable).toBe('да');
  });

  it('баланс: каждое число с пояснением из схемы', () => {
    const groups = balanceGroups(DATA);
    expect(groups.map((g) => g.title)).toEqual([
      'Время (GDD §2.1, §13.1)',
      'Движение (GDD §13.1)',
      'Жизнь (GDD §13.1)',
      'Жители: ходьба и отдых у дома (шаг 1.3)',
      'Потребности: шкалы 0–100, 100 — нужды нет (GDD §4.2; сытость и жажда — вдесятеро дольше, решение владельца, ADR-024)',
      'Сон: полезность «спать» = нужда² × множитель фазы суток + прибавка фазы (GDD §4.2)',
      'Еда и питьё (GDD §13.2)',
      'Выбор действия: полезность = нужда² × доступность (GDD §2.3)',
      'Предметы: стоянка, куча, ноша, падение веток (GDD §5.1, шаг 1.7)',
      'Карта (GDD §2.2, §3.1, §3.3)',
    ]);
    const rows = new Map(groups.flatMap((g) => g.rows).map((r) => [r.key, r.value]));
    expect(rows.get('time.ticksPerDay')).toBe('400 тиков');
    expect(rows.get('time.phasePercent')).toBe('рассвет 10 % · день 50 % · закат 10 % · ночь 30 %');
    expect(rows.get('life.fertileAge')).toBe('с 16 лет · по 45 лет');
    expect(rows.get('life.pregnancySeasons')).toBe('3 сезона');
    expect(rows.get('life.minYearsBetweenChildren')).toBe('2 года');
    expect(rows.get('movement.pathSearchTiles')).toBe('4096 тайлов');
    expect(rows.get('villagers.restTicks')).toBe('от 30 тиков · до 120 тиков');
    expect(rows.get('needs.food')).toBe(
      'от 100 до 0 за 25 сут · на нуле здоровье от 100 до 0 (смерть — голод) за 40 сут',
    );
    expect(rows.get('eating.biteRations')).toBe('0,25 рациона');
    expect(rows.get('ai.restUtility')).toBe('0,15');
    expect(rows.get('map.width')).toBe('64 тайла');
    expect(rows.get('map.bushes')).toBe('от 12 шт. · до 22 шт.');
    expect(rows.get('map.camp')).toBe(
      'сторона 5 тайлов · до воды не дальше 12 тайлов · до леса не дальше 10 тайлов',
    );
    expect(groups.flatMap((g) => g.rows).every((r) => r.doc !== r.key.split('.').at(-1))).toBe(
      true,
    );
  });
});
