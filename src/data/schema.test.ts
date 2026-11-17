import { describe, expect, it } from 'vitest';
import {
  bool,
  type Cursor,
  checkExternalRefs,
  closest,
  DataError,
  type DataIssue,
  deepFreeze,
  editDistance,
  external,
  type Field,
  formatIssue,
  formatNumber,
  id,
  int,
  list,
  nullable,
  num,
  obj,
  oneOf,
  optional,
  readTables,
  ref,
  show,
  table,
  text,
} from './schema.ts';

/** Read one value with a schema; returns the value and the problems found. */
function read<T>(schema: Field<T>, value: unknown) {
  const cursor: Cursor = {
    file: 'data/test.json',
    record: null,
    path: '',
    sink: { issues: [], refs: [], external: [] },
  };
  const result = schema.read(value, cursor);
  return { result, issues: cursor.sink.issues, sink: cursor.sink };
}

function messages(issues: readonly DataIssue[]): string[] {
  return issues.map(formatIssue);
}

describe('простые значения', () => {
  it('целое число в диапазоне', () => {
    const schema = int({ min: 1, max: 10 });
    expect(read(schema, 5)).toMatchObject({ result: 5, issues: [] });
    expect(read(schema, 1).issues).toEqual([]);
    expect(read(schema, 10).issues).toEqual([]);
    expect(messages(read(schema, 11).issues)).toEqual([
      'data/test.json: ожидается целое число от 1 до 10, получено 11',
    ]);
    expect(messages(read(schema, 2.5).issues)).toEqual([
      'data/test.json: ожидается целое число от 1 до 10, получено 2,5',
    ]);
  });

  it('число в кавычках — подсказка убрать кавычки', () => {
    const [issue] = read(int({ min: 1, max: 10 }), '3').issues;
    expect(issue!.message).toBe(
      'ожидается целое число от 1 до 10, получено "3" (это строка в кавычках — уберите кавычки)',
    );
    expect(read(num({ min: 0, max: 1 }), '0,5').issues[0]!.message).toContain('уберите кавычки');
    expect(read(bool(), 'true').issues[0]!.message).toContain('уберите кавычки');
    expect(read(int({ min: 1, max: 10 }), 'много').issues[0]!.message).not.toContain('кавычки');
  });

  it('дробное число', () => {
    const schema = num({ min: 0.25, max: 100 });
    expect(read(schema, 0.25).issues).toEqual([]);
    expect(read(schema, 3).result).toBe(3);
    expect(read(schema, 0.1).issues[0]!.message).toBe(
      'ожидается число от 0,25 до 100, получено 0,1',
    );
    expect(read(schema, Number.NaN).issues).toHaveLength(1);
    expect(read(schema, Number.POSITIVE_INFINITY).issues).toHaveLength(1);
  });

  it('да или нет', () => {
    expect(read(bool(), true)).toMatchObject({ result: true, issues: [] });
    expect(read(bool(), 1).issues[0]!.message).toBe('ожидается true или false, получено 1');
  });

  it('строка: не пустая и не слишком длинная', () => {
    const schema = text({ maxLength: 5 });
    expect(read(schema, 'Ягоды').issues).toEqual([]);
    expect(read(schema, '').issues).toHaveLength(1);
    expect(read(schema, '   ').issues).toHaveLength(1);
    expect(read(schema, 'Длинное').issues[0]!.message).toBe(
      'ожидается непустая строка до 5 знаков, получено "Длинное"',
    );
  });

  it('идентификатор — snake_case латиницей', () => {
    const schema = id();
    for (const good of ['berries', 'berry_bush', 'grass_2', 'a1']) {
      expect(read(schema, good).issues, good).toEqual([]);
    }
    for (const bad of ['Berries', 'berry-bush', 'berry__bush', '_berry', 'berry_', 'ягоды', '2x']) {
      expect(read(schema, bad).issues, bad).toHaveLength(1);
    }
  });

  it('одно из списка, с подсказкой при опечатке', () => {
    const schema = oneOf(['food', 'material'] as const, {
      names: { food: 'еда', material: 'материал' },
    });
    expect(read(schema, 'food').result).toBe('food');
    expect(read(schema, 'fod').issues[0]!.message).toBe(
      'ожидается одно из: food (еда), material (материал), получено "fod" — может быть, «food»?',
    );
    expect(read(schema, 'stone').issues[0]!.message).not.toContain('может быть');
  });
});

describe('null и необязательные поля', () => {
  it('null разрешён и объяснён в сообщении', () => {
    const schema = nullable(num({ min: 1, max: 9 }), 'не портится');
    expect(read(schema, null)).toMatchObject({ result: null, issues: [] });
    expect(read(schema, 3).result).toBe(3);
    expect(messages(read(schema, 'три').issues)).toEqual([
      'data/test.json: ожидается число от 1 до 9 или null (не портится), получено "три"',
    ]);
  });

  it('необязательное поле берёт значение по умолчанию', () => {
    const schema = obj({ name: text(), size: optional(int({ min: 1, max: 9 }), 1) });
    expect(read(schema, { name: 'x' })).toMatchObject({
      result: { name: 'x', size: 1 },
      issues: [],
    });
    expect(read(schema, { name: 'x', size: 4 }).result).toEqual({ name: 'x', size: 4 });
    expect(read(schema, { name: 'x', size: 0 }).issues).toHaveLength(1);
  });
});

describe('объекты', () => {
  const schema = obj({ stack: int({ min: 1, max: 9 }), spoilDays: num({ min: 1, max: 9 }) });

  it('нет обязательного поля', () => {
    expect(messages(read(schema, { stack: 2 }).issues)).toEqual([
      'data/test.json · поле «spoilDays»: нет обязательного поля (ожидается число от 1 до 9)',
    ]);
  });

  it('лишнее поле — скорее всего опечатка: подсказка', () => {
    expect(messages(read(schema, { stack: 2, spoilDays: 3, spoilDay: 3 }).issues)).toEqual([
      'data/test.json · поле «spoilDay»: лишнее поле — может быть, «spoilDays»? Известные поля: stack, spoilDays',
    ]);
    expect(read(schema, { stack: 2, spoilDays: 3, colour: 'red' }).issues[0]!.message).toBe(
      'лишнее поле. Известные поля: stack, spoilDays',
    );
  });

  it('не объект', () => {
    for (const bad of [null, [], 'x', 3]) {
      expect(read(schema, bad).issues[0]!.message, String(bad)).toMatch(
        /^ожидается объект с полями stack, spoilDays/,
      );
    }
  });

  it('путь к вложенному полю', () => {
    const nested = obj({ time: obj({ phase: obj({ dawn: int({ min: 1, max: 99 }) }) }) });
    expect(messages(read(nested, { time: { phase: { dawn: 0 } } }).issues)).toEqual([
      'data/test.json · поле «time.phase.dawn»: ожидается целое число от 1 до 99, получено 0',
    ]);
  });

  it('правило про объект целиком проверяется, только если поля в порядке', () => {
    const shares = obj(
      { a: int({ min: 0, max: 100 }), b: int({ min: 0, max: 100 }) },
      { check: ({ a, b }) => (a + b === 100 ? null : `в сумме ${a + b}, а нужно 100`) },
    );
    expect(read(shares, { a: 40, b: 60 }).issues).toEqual([]);
    expect(messages(read(shares, { a: 40, b: 50 }).issues)).toEqual([
      'data/test.json: в сумме 90, а нужно 100',
    ]);
    expect(messages(read(shares, { a: 40, b: 'x' }).issues)).toEqual([
      'data/test.json · поле «b»: ожидается целое число от 0 до 100, получено "x"',
    ]);
  });
});

describe('списки и таблицы', () => {
  it('список: размер и путь к элементу', () => {
    const schema = list(int({ min: 0, max: 9 }), { min: 1, max: 3 });
    expect(read(schema, [1, 2]).result).toEqual([1, 2]);
    expect(messages(read(schema, [1, 20]).issues)).toEqual([
      'data/test.json · поле «[1]»: ожидается целое число от 0 до 9, получено 20',
    ]);
    expect(read(schema, []).issues[0]!.message).toBe('в списке 0 элементов, а нужно от 1 до 3');
    expect(read(obj({ tags: list(id()) }), { tags: ['a', 'B'] }).issues[0]!.field).toBe('tags[1]');
  });

  const records = table({ id: id(), stack: int({ min: 1, max: 9 }) });

  it('таблица: ошибка внутри записи называет запись по id', () => {
    expect(messages(read(records, [{ id: 'nuts', stack: 2 }, { id: 'berries' }]).issues)).toEqual([
      'data/test.json · запись «berries» · поле «stack»: нет обязательного поля (ожидается целое число от 1 до 9)',
    ]);
  });

  it('запись без годного id называется по номеру', () => {
    expect(
      messages(
        read(records, [
          { id: 'nuts', stack: 2 },
          { id: 'Ягоды', stack: 1 },
        ]).issues,
      ),
    ).toEqual([
      'data/test.json · запись №2 · поле «id»: ожидается идентификатор snake_case латиницей (как berry_bush), получено "Ягоды"',
    ]);
    expect(read(records, [42]).issues[0]!.record).toBe('№1');
  });

  it('id в таблице не повторяются', () => {
    const { issues } = read(records, [
      { id: 'nuts', stack: 1 },
      { id: 'fish', stack: 1 },
      { id: 'nuts', stack: 2 },
    ]);
    expect(messages(issues)).toEqual([
      'data/test.json · запись «nuts» (№3) · поле «id»: id «nuts» уже занят записью №1 — id в таблице не повторяются',
    ]);
  });

  it('таблица — список, и не пустой', () => {
    expect(read(records, { id: 'nuts' }).issues[0]!.message).toMatch(/^ожидается список записей/);
    expect(read(records, []).issues[0]!.message).toBe('в таблице 0 записей, а нужно хотя бы 1');
    expect(read(table({ id: id() }, { minRecords: 0 }), []).issues).toEqual([]);
  });

  it('правило про запись целиком', () => {
    const schema = table(
      { id: id(), walkable: bool(), speed: nullable(num({ min: 0.1, max: 3 }), 'непроходимо') },
      { check: (r) => (r.walkable === (r.speed !== null) ? null : 'скорость не согласована') },
    );
    expect(read(schema, [{ id: 'grass', walkable: true, speed: 1 }]).issues).toEqual([]);
    expect(messages(read(schema, [{ id: 'water', walkable: false, speed: 1 }]).issues)).toEqual([
      'data/test.json · запись «water»: скорость не согласована',
    ]);
  });
});

describe('несколько таблиц и ссылки', () => {
  const schemas = {
    resources: {
      file: 'data/resources.json',
      schema: table({ id: id(), sprite: external('sprite', 'спрайт') }),
    },
    recipes: { file: 'data/recipes.json', schema: table({ id: id(), output: ref('resources') }) },
  };

  it('ссылка на запись другой таблицы', () => {
    const { values, issues } = readTables(schemas, {
      resources: [{ id: 'berries', sprite: 'berries' }],
      recipes: [{ id: 'jam', output: 'berries' }],
    });
    expect(issues).toEqual([]);
    expect(values.recipes[0]!.output).toBe('berries');
  });

  it('ссылка на несуществующую запись — ошибка с подсказкой', () => {
    const { issues } = readTables(schemas, {
      resources: [{ id: 'berries', sprite: 'berries' }],
      recipes: [
        { id: 'jam', output: 'beries' },
        { id: 'soup', output: 'water' },
      ],
    });
    expect(messages(issues)).toEqual([
      'data/recipes.json · запись «jam» · поле «output»: нет записи «beries» в таблице data/resources.json — может быть, «berries»?',
      'data/recipes.json · запись «soup» · поле «output»: нет записи «water» в таблице data/resources.json',
    ]);
  });

  it('ссылка на неизвестную таблицу — ошибка в схеме, а не в данных', () => {
    const broken = { a: { file: 'data/a.json', schema: table({ id: id(), b: ref('nowhere') }) } };
    expect(() => readTables(broken, { a: [{ id: 'x', b: 'y' }] })).toThrow(/неизвестную таблицу/);
  });

  it('внешние ссылки собираются и проверяются по каталогу', () => {
    const { external: refs } = readTables(schemas, {
      resources: [
        { id: 'berries', sprite: 'berries' },
        { id: 'nuts', sprite: 'nutz' },
      ],
      recipes: [],
    });
    expect(refs.map((r) => r.id)).toEqual(['berries', 'nutz']);
    expect(messages(checkExternalRefs(refs, { sprite: ['berries', 'nuts'] }))).toEqual([
      'data/resources.json · запись «nuts» · поле «sprite»: ссылка на несуществующий спрайт «nutz» — может быть, «nuts»?',
    ]);
    expect(checkExternalRefs(refs, {})).toEqual([]);
  });
});

describe('вспомогательное', () => {
  it('DataError перечисляет все ошибки', () => {
    const error = new DataError([
      { file: 'data/a.json', record: '«x»', field: 'f', message: 'плохо' },
      { file: 'data/b.json', record: null, field: '', message: 'тоже плохо' },
    ]);
    expect(error.message).toBe(
      'Ошибки в таблицах данных (2):\n  • data/a.json · запись «x» · поле «f»: плохо\n  • data/b.json: тоже плохо',
    );
    expect(error.issues).toHaveLength(2);
  });

  it('значения в сообщениях', () => {
    expect(show(undefined)).toBe('ничего');
    expect(show(null)).toBe('null');
    expect(show(0.5)).toBe('0,5');
    expect(show('x'.repeat(60))).toHaveLength(42);
    expect(show([1, 2])).toBe('список из 2 элементов');
    expect(show({ a: 1 })).toBe('объект {"a":1}');
    expect(formatNumber(100_000)).toBe('100000');
  });

  it('расстояние между словами и ближайшее слово', () => {
    expect(editDistance('berries', 'berries')).toBe(0);
    expect(editDistance('beries', 'berries')).toBe(1);
    expect(editDistance('spoilday', 'spoilDays')).toBe(2);
    expect(closest('spoilDay', ['stack', 'spoilDays'])).toBe('spoilDays');
    expect(closest('colour', ['stack', 'spoilDays'])).toBeNull();
  });

  it('загруженное замораживается целиком', () => {
    const value = deepFreeze({ a: { b: [1, { c: 2 }] } });
    expect(Object.isFrozen(value.a.b[1])).toBe(true);
    expect(() => {
      (value.a as { b: unknown }).b = 1;
    }).toThrow(TypeError);
  });
});
