/**
 * The game's tables are checked when they load: a broken record — a missing field, a wrong type,
 * a value out of range, a typo in a key, a repeated id — must fail with a message naming the
 * file, the record and the field. These tests break copies of the real files on purpose.
 */
import { describe, expect, it } from 'vitest';
import { DATA, RAW_TABLES } from './index.ts';
import { DataError, formatIssue } from './schema.ts';
import { DAY_PHASES, loadTables, type RawTables, TABLES } from './tables.ts';

type Json = Record<string, unknown>;

/** Load a corrupted copy of the real tables and return the messages of the error. */
type Tables = { balance: Json; resources: Json[]; terrain: Json[]; objects: Json[] };

function problemsWith(corrupt: (tables: Tables) => void) {
  const copy = structuredClone(RAW_TABLES) as Tables;
  corrupt(copy);
  try {
    loadTables(copy as RawTables);
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).issues.map(formatIssue);
  }
  throw new Error('испорченная таблица загрузилась без ошибки');
}

const berries = (tables: { resources: Json[] }) =>
  tables.resources.find((r) => r.id === 'berries')!;

describe('таблицы игры', () => {
  it('все таблицы загружаются без ошибок', () => {
    expect(() => loadTables(RAW_TABLES)).not.toThrow();
    expect(Object.keys(TABLES)).toEqual(['balance', 'resources', 'terrain', 'objects']);
  });

  it('время — из GDD §2.1 и §13.1', () => {
    expect(DATA.balance.time).toEqual({
      ticksPerSecond: 10,
      ticksPerDay: 400,
      daysPerSeason: 3,
      phasePercent: { dawn: 10, day: 50, dusk: 10, night: 30 },
    });
    expect(Object.keys(DATA.balance.time.phasePercent)).toEqual([...DAY_PHASES]);
    expect(DATA.balance.movement.walkTicksPerTile).toBe(4);
  });

  it('жизнь — из GDD §13.1', () => {
    expect(DATA.balance.life).toEqual({
      dayPercent: { work: 55, sleep: 30, leisure: 15 },
      adultAge: 15,
      fertileAge: { from: 16, to: 45 },
      pregnancySeasons: 3,
      minYearsBetweenChildren: 2,
    });
  });

  it('запись по id', () => {
    expect(DATA.resources.get('berries')).toMatchObject({ name: 'Ягоды', category: 'food' });
    expect(DATA.resources.has('berries')).toBe(true);
    expect(DATA.resources.has('bread')).toBe(false);
    expect(() => DATA.resources.get('bread')).toThrow(
      'Нет записи «bread» в таблице data/resources.json',
    );
    expect(DATA.terrain.get('grass').speed).toBe(1);
  });

  it('загруженные таблицы нельзя изменить по ошибке', () => {
    const record = DATA.resources.records[0]! as { stack: number };
    expect(() => {
      record.stack = 99;
    }).toThrow(TypeError);
    expect(() => {
      (DATA.balance.time as { ticksPerDay: number }).ticksPerDay = 1;
    }).toThrow(TypeError);
  });
});

describe('испорченная запись даёт понятную ошибку', () => {
  it('нет поля', () => {
    expect(
      problemsWith((t) => {
        delete berries(t).stack;
      }),
    ).toEqual([
      'data/resources.json · запись «berries» · поле «stack»: нет обязательного поля (ожидается целое число от 1 до 1000)',
    ]);
  });

  it('неверный тип', () => {
    expect(
      problemsWith((t) => {
        berries(t).stack = 'много';
      }),
    ).toEqual([
      'data/resources.json · запись «berries» · поле «stack»: ожидается целое число от 1 до 1000, получено "много"',
    ]);
    expect(
      problemsWith((t) => {
        berries(t).spoilDays = '3';
      }),
    ).toEqual([
      'data/resources.json · запись «berries» · поле «spoilDays»: ожидается число от 0,25 до 1000 или null (не портится), получено "3"',
    ]);
  });

  it('вне диапазона', () => {
    expect(
      problemsWith((t) => {
        berries(t).era = 9;
      }),
    ).toEqual([
      'data/resources.json · запись «berries» · поле «era»: ожидается целое число от 0 до 5, получено 9',
    ]);
  });

  it('опечатка в имени поля', () => {
    expect(
      problemsWith((t) => {
        const record = berries(t);
        record.spoilDay = record.spoilDays;
        delete record.spoilDays;
      }),
    ).toEqual([
      'data/resources.json · запись «berries» · поле «spoilDays»: нет обязательного поля (ожидается число от 0,25 до 1000 или null (не портится))',
      'data/resources.json · запись «berries» · поле «spoilDay»: лишнее поле — может быть, «spoilDays»? Известные поля: id, name, category, era, stack, spoilDays, sprite, pile, carry',
    ]);
  });

  it('неизвестная категория', () => {
    expect(
      problemsWith((t) => {
        berries(t).category = 'fod';
      }),
    ).toEqual([
      'data/resources.json · запись «berries» · поле «category»: ожидается одно из: food (еда), material (материал), product (изделие), получено "fod" — может быть, «food»?',
    ]);
  });

  it('повтор id', () => {
    expect(
      problemsWith((t) => {
        t.resources.push({ ...berries(t), name: 'Ещё ягоды' });
      }),
    ).toEqual([
      `data/resources.json · запись «berries» (№${DATA.resources.records.length + 1}) · поле «id»: id «berries» уже занят записью №1 — id в таблице не повторяются`,
    ]);
  });

  it('доли фаз суток не дают 100 %', () => {
    expect(
      problemsWith((t) => {
        ((t.balance.time as Json).phasePercent as Json).night = 40;
      }),
    ).toEqual([
      'data/balance.json · поле «time.phasePercent»: Доли фаз суток в сумме дают 110 %, а нужно ровно 100 %',
    ]);
  });

  it('детородный возраст: начало позже конца', () => {
    expect(
      problemsWith((t) => {
        ((t.balance.life as Json).fertileAge as Json).from = 50;
      }),
    ).toEqual([
      'data/balance.json · поле «life.fertileAge»: начало (50) должно быть раньше конца (45)',
    ]);
  });

  it('объект карты: неизвестное место, повтор состояний, вес без места', () => {
    const oak = (t: Tables) => t.objects.find((r) => r.id === 'oak')!;
    expect(
      problemsWith((t) => {
        oak(t).place = 'forst';
      }),
    ).toEqual([
      'data/objects.json · запись «oak» · поле «place»: ожидается одно из: forest (лес), edge (опушка), scatter (россыпь), meadow (луг), forage (корм у опушки) или null (не появляется при сотворении карты), получено "forst"',
    ]);
    expect(
      problemsWith((t) => {
        oak(t).states = ['grown', 'grown'];
      }),
    ).toEqual(['data/objects.json · запись «oak»: состояния повторяются']);
    expect(
      problemsWith((t) => {
        oak(t).place = null;
      }),
    ).toEqual(['data/objects.json · запись «oak»: вес без места (place) — должен быть 0']);
    expect(
      problemsWith((t) => {
        oak(t).states = [];
      }),
    ).toEqual([
      'data/objects.json · запись «oak» · поле «states»: в списке 0 элементов, а нужно от 1 до 16',
    ]);
  });

  it('еда на объекте: ресурс есть, состояние «всё собрано» — из списка и не начальное', () => {
    const bush = (t: Tables) => t.objects.find((r) => r.id === 'berry_bush')!;
    const harvest = (t: Tables) => bush(t).harvest as Json;
    expect(DATA.objects.get('berry_bush').harvest).toEqual({
      food: 'berries',
      // Step 1.11: a handful a year (ADR-031), ripening in spring.
      rations: 0.25,
      empty: 'empty',
      // Step 1.10: no berries in winter (GDD §3.2).
      seasons: ['spring', 'summer', 'autumn'],
      ripens: 'spring',
    });
    expect(DATA.objects.get('oak').harvest).toBeNull();
    expect(
      problemsWith((t) => {
        harvest(t).seasons = ['summer', 'winer'];
      }),
    ).toHaveLength(1);
    expect(
      problemsWith((t) => {
        harvest(t).seasons = ['summer', 'summer'];
      }),
    ).toEqual(['data/objects.json · запись «berry_bush»: сезоны harvest.seasons повторяются']);
    expect(
      problemsWith((t) => {
        harvest(t).food = 'beries';
      }),
    ).toEqual([
      'data/objects.json · запись «berry_bush» · поле «harvest.food»: нет записи «beries» в таблице data/resources.json — может быть, «berries»?',
    ]);
    expect(
      problemsWith((t) => {
        harvest(t).empty = 'bare';
      }),
    ).toEqual([
      'data/objects.json · запись «berry_bush»: состояние «bare» (harvest.empty) не из списка states: ripe, empty',
    ]);
    expect(
      problemsWith((t) => {
        harvest(t).empty = 'ripe';
      }),
    ).toEqual([
      'data/objects.json · запись «berry_bush»: harvest.empty не может быть начальным состоянием «ripe» — объект появляется с едой',
    ]);
    expect(
      problemsWith((t) => {
        harvest(t).ripens = 'winter';
      }),
    ).toEqual([
      'data/objects.json · запись «berry_bush»: сезон созревания «winter» (harvest.ripens) не из сезонов сбора: spring, summer, autumn',
    ]);
    expect(
      problemsWith((t) => {
        delete bush(t).harvest;
      }),
    ).toHaveLength(1);
  });

  it('потребности — GDD §4.2, сытость и жажда вдесятеро дольше (решение владельца, ADR-024)', () => {
    expect(DATA.balance.needs).toEqual({
      food: { emptyDays: 25, deathDays: 40 },
      water: { emptyDays: 15, deathDays: 20 },
      sleep: { emptyDays: 1.5 },
      // Warmth (step 1.10): GDD §4.2 «зависит от погоды и одежды» — numbers of ADR-030.
      warmth: { comfort: 10, pointsPerDegreeDay: 6, deathDays: 1, shiverPoints: 40 },
      healDays: 2,
    });
    // Sleep (step 1.5): GDD §4.2 — 1.5 days, the ground ×0.5.
    expect(DATA.balance.sleeping.groundFactor).toBe(0.5);
    expect(DATA.balance.eating.rationPoints).toBe(40);
  });

  it('карта: стороны делятся на чанки, «от» не больше «до»', () => {
    expect(
      problemsWith((t) => {
        (t.balance.map as Json).width = 70;
      }),
    ).toEqual([
      'data/balance.json · поле «map»: стороны карты (70×64) должны делиться на сторону чанка (32)',
    ]);
    expect(
      problemsWith((t) => {
        ((t.balance.map as Json).bushes as Json).min = 30;
      }),
    ).toEqual(['data/balance.json · поле «map.bushes»: «от» (30) больше, чем «до» (22)']);
  });

  it('проходимость и скорость земли согласованы', () => {
    expect(
      problemsWith((t) => {
        t.terrain.find((r) => r.id === 'deep_water')!.speed = 0.5;
      }),
    ).toEqual(['data/terrain.json · запись «deep_water»: у непроходимой земли скорость — null']);
    expect(
      problemsWith((t) => {
        t.terrain.find((r) => r.id === 'sand')!.speed = null;
      }),
    ).toEqual(['data/terrain.json · запись «sand»: у проходимой земли нужна скорость (speed)']);
  });

  it('все ошибки всех файлов — сразу, одним сообщением', () => {
    const problems = problemsWith((t) => {
      delete berries(t).name;
      (t.balance.movement as Json).walkTicksPerTile = 0;
      t.terrain.find((r) => r.id === 'grass')!.walkable = 'yes';
    });
    expect(problems).toEqual([
      'data/balance.json · поле «movement.walkTicksPerTile»: ожидается целое число от 1 до 100, получено 0',
      'data/resources.json · запись «berries» · поле «name»: нет обязательного поля (ожидается непустая строка до 40 знаков)',
      'data/terrain.json · запись «grass» · поле «walkable»: ожидается true или false, получено "yes"',
    ]);
  });

  it('файл не той формы', () => {
    expect(
      problemsWith((t) => {
        (t as { resources: unknown }).resources = { berries: {} };
      }),
    ).toEqual([
      'data/resources.json: ожидается список записей [{ … }, { … }], у каждой — объект с полями id, name, category, era, stack, spoilDays, sprite, pile, carry, получено объект {"berries":{}}',
    ]);
  });
});
