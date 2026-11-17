import { describe, expect, it } from 'vitest';
import { createPalette } from './palette.ts';
import {
  defaultAnimation,
  frameAt,
  frameDurations,
  parseGrid,
  type SpriteDef,
  shadowMask,
  shadowOrigin,
  usedRamps,
  validateSprite,
  validateSpriteSet,
} from './sprite.ts';

const TEST = createPalette([
  { name: 'bark', title: '', colors: ['#200000', '#600000', '#a00000'] },
  { name: 'leaf', title: '', colors: ['#002000', '#006000', '#00a000'] },
  { name: 'moss', title: '', colors: ['#002020', '#006060'] },
]);

/** A valid 4×3 sprite; tests break one thing at a time. */
function stone(changes: Partial<Record<keyof SpriteDef, unknown>> = {}): SpriteDef {
  return {
    name: 'stone',
    title: 'Камень',
    kind: 'object',
    width: 4,
    height: 3,
    anchor: { x: 2, y: 3 },
    legend: { o: 'bark.0', m: 'bark.2' },
    animations: {
      idle: {
        frames: [
          `
          .oo.
          ommo
          oooo
          `,
        ],
      },
    },
    ...changes,
  } as SpriteDef;
}

function frames(...grids: string[]) {
  return { idle: { frames: grids } };
}

describe('сетка кадра', () => {
  it('строки обрезаются по краям, пустые строки до и после сетки отбрасываются', () => {
    expect(parseGrid('\n    .oo.\n    ommo  \n\n')).toEqual(['.oo.', 'ommo']);
    expect(parseGrid('ab\ncd')).toEqual(['ab', 'cd']);
  });

  it('пустая строка внутри сетки остаётся — проверка назовёт её', () => {
    expect(parseGrid('ab\n\ncd')).toEqual(['ab', '', 'cd']);
  });
});

describe('время анимации', () => {
  it('длительность кадров: по умолчанию 100 мс, одна на все или своя у каждого', () => {
    expect(frameDurations({ frames: ['a', 'b'] })).toEqual([100, 100]);
    expect(frameDurations({ frames: ['a', 'b'], frameMs: 250 })).toEqual([250, 250]);
    expect(frameDurations({ frames: ['a', 'b'], frameMs: [600, 200] })).toEqual([600, 200]);
  });

  it('кадр на экране в момент времени: по кругу, с задержками', () => {
    const durations = [600, 200, 600, 200];
    expect(
      [0, 599, 600, 799, 800, 1399, 1400, 1599, 1600].map((t) => frameAt(durations, t)),
    ).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 0]);
    expect(frameAt(durations, -1)).toBe(3);
    expect(frameAt([100], 12345)).toBe(0);
    expect(frameAt([], 50)).toBe(0);
  });

  it('анимация по умолчанию — первая', () => {
    expect(
      defaultAnimation(stone({ animations: { walk: { frames: ['x'] }, idle: { frames: ['y'] } } })),
    ).toBe('walk');
  });
});

describe('проверка спрайта', () => {
  it('правильный спрайт — без замечаний', () => {
    expect(validateSprite(stone(), TEST)).toEqual([]);
  });

  it('строка не той длины: названы анимация, кадр, строка, длины и сама строка', () => {
    const problems = validateSprite(stone({ animations: frames('.oo.\nomm\noooo') }), TEST);
    expect(problems).toEqual([
      'спрайт «stone»: анимация «idle», кадр 1, строка 2: длина 3, ожидалось 4 (ширина спрайта) — «omm»',
    ]);
  });

  it('не то число строк', () => {
    expect(validateSprite(stone({ animations: frames('.oo.\nommo') }), TEST)).toEqual([
      'спрайт «stone»: анимация «idle», кадр 1: строк 2, ожидалось 3 (высота спрайта)',
    ]);
  });

  it('символ, которого нет в легенде: названы строка и столбец', () => {
    expect(validateSprite(stone({ animations: frames('.oo.\nomxo\noooo') }), TEST)).toEqual([
      'спрайт «stone»: анимация «idle», кадр 1, строка 2, столбец 3: символа «x» нет в легенде',
    ]);
  });

  it('пробел внутри строки — подсказка про точку', () => {
    expect(validateSprite(stone({ animations: frames('.oo.\no mo\noooo') }), TEST)).toEqual([
      'спрайт «stone»: анимация «idle», кадр 1, строка 2, столбец 2: символа « » нет в легенде — пробел внутри строки; прозрачный пиксель пишется «.»',
    ]);
  });

  it('цвет не из палитры: нет такого ряда, нет такого номера, неверная запись', () => {
    expect(validateSprite(stone({ legend: { o: 'bark.0', m: 'barc.2' } }), TEST)).toEqual([
      'спрайт «stone»: легенда, символ «m»: в палитре нет ряда «barc» (цвет barc.2)',
    ]);
    expect(validateSprite(stone({ legend: { o: 'bark.0', m: 'bark.3' } }), TEST)).toEqual([
      'спрайт «stone»: легенда, символ «m»: в ряду «bark» нет цвета 3 — есть 0…2',
    ]);
    expect(validateSprite(stone({ legend: { o: 'bark.0', m: '#ff0000' } }), TEST)).toEqual([
      'спрайт «stone»: легенда, символ «m»: «#ff0000» — цвет пишется как «ряд.номер», например grass.2',
    ]);
  });

  it('ключи легенды: один символ, точку переопределять нельзя, лишние символы не нужны', () => {
    expect(
      validateSprite(stone({ legend: { o: 'bark.0', m: 'bark.2', mm: 'bark.1' } }), TEST),
    ).toEqual(['спрайт «stone»: легенда, символ «mm»: ключ легенды — ровно один видимый символ']);
    expect(
      validateSprite(stone({ legend: { o: 'bark.0', m: 'bark.2', '.': 'bark.1' } }), TEST),
    ).toEqual([
      'спрайт «stone»: легенда, символ «.»: «.» всегда означает прозрачный пиксель, его нельзя переопределять',
    ]);
    expect(
      validateSprite(stone({ legend: { o: 'bark.0', m: 'bark.2', z: 'bark.1' } }), TEST),
    ).toEqual([
      'спрайт «stone»: легенда, символ «z»: не встречается ни в одном кадре — уберите его',
    ]);
  });

  it('имя, название, вид, размер и точка привязки', () => {
    expect(validateSprite(stone({ name: 'Big Stone' }), TEST)).toEqual([
      'спрайт «Big Stone»: имя должно быть snake_case латиницей (a–z, 0–9, _)',
    ]);
    expect(validateSprite(stone({ title: ' ' }), TEST)).toEqual([
      'спрайт «stone»: нет названия (title)',
    ]);
    expect(validateSprite(stone({ kind: 'house' }), TEST)).toEqual([
      'спрайт «stone»: неизвестный вид «house» — допустимы tile, object, item, character, icon',
    ]);
    expect(validateSprite(stone({ width: 0 }), TEST)).toContain(
      'спрайт «stone»: размер 0×3 — нужны целые числа от 1 до 256',
    );
    expect(validateSprite(stone({ anchor: { x: 5, y: 3 } }), TEST)).toEqual([
      'спрайт «stone»: точка привязки (5, 3) вне спрайта — нужны целые x от 0 до 4, y от 0 до 3',
    ]);
  });

  it('предмет помещается в тайл', () => {
    expect(validateSprite(stone({ kind: 'item' }), TEST)).toEqual([]);
    const wide = `${'o'.repeat(17)}\n${'m'.repeat(17)}`;
    expect(
      validateSprite(
        stone({
          kind: 'item',
          width: 17,
          height: 2,
          anchor: { x: 8, y: 2 },
          animations: frames(wide),
        }),
        TEST,
      ),
    ).toEqual(['спрайт «stone»: предмет 17×2 должен помещаться в тайл 16×16']);
  });

  it('тайл — ровно 16×16 с привязкой в левом верхнем углу', () => {
    const problems = validateSprite(stone({ kind: 'tile' }), TEST);
    expect(problems).toEqual([
      'спрайт «stone»: тайл должен быть 16×16, а не 4×3',
      'спрайт «stone»: точка привязки тайла — его левый верхний угол (0, 0)',
    ]);
  });

  it('анимации: хотя бы одна, с кадрами, с разумными длительностями', () => {
    expect(validateSprite(stone({ animations: {}, legend: {} }), TEST)).toEqual([
      'спрайт «stone»: нет ни одной анимации',
    ]);
    expect(
      validateSprite(stone({ animations: { idle: { frames: [] } }, legend: {} }), TEST),
    ).toEqual(['спрайт «stone»: анимация «idle»: нет ни одного кадра']);
    const grid = '.oo.\nommo\noooo';
    expect(
      validateSprite(
        stone({ animations: { Idle: { frames: [grid], frameMs: [100, 100] } } }),
        TEST,
      ),
    ).toEqual([
      'спрайт «stone»: анимация «Idle»: имя должно быть snake_case латиницей',
      'спрайт «stone»: анимация «Idle»: длительностей кадров 2, а кадров 1',
    ]);
    expect(
      validateSprite(stone({ animations: { idle: { frames: [grid], frameMs: 2.5 } } }), TEST),
    ).toEqual([
      'спрайт «stone»: анимация «idle»: длительность кадра 2.5 мс — нужно целое число от 10 до 60000',
    ]);
  });

  it('ошибки во втором кадре второй анимации называют именно его', () => {
    const good = '.oo.\nommo\noooo';
    const problems = validateSprite(
      stone({
        animations: { idle: { frames: [good] }, roll: { frames: [good, '.oo.\nommo\nooo#'] } },
      }),
      TEST,
    );
    expect(problems).toEqual([
      'спрайт «stone»: анимация «roll», кадр 2, строка 3, столбец 4: символа «#» нет в легенде',
    ]);
  });

  it('варианты перекраски: ряды существуют, одной длины и есть в спрайте', () => {
    expect(validateSprite(stone({ variants: { green: { bark: 'leaf' } } }), TEST)).toEqual([]);
    expect(validateSprite(stone({ variants: { mossy: { bark: 'moss' } } }), TEST)).toEqual([
      'спрайт «stone»: вариант «mossy»: подмена «bark → moss»: в рядах разное число цветов (3 и 2)',
    ]);
    expect(validateSprite(stone({ variants: { pointless: { leaf: 'bark' } } }), TEST)).toEqual([
      'спрайт «stone»: вариант «pointless»: ни один из заменяемых рядов (leaf) не используется в спрайте',
    ]);
  });

  it('ряды палитры, на которые ссылается спрайт', () => {
    expect([...usedRamps(stone({ legend: { o: 'bark.0', m: 'leaf.2' } }))]).toEqual([
      'bark',
      'leaf',
    ]);
  });

  it('имена спрайтов не повторяются', () => {
    expect(validateSpriteSet([stone(), stone({ name: 'rock' }), stone()])).toEqual([
      'спрайт «stone»: имя уже занято другим спрайтом',
    ]);
  });
});

describe('тень', () => {
  const rows = (mask: boolean[][]) => mask.map((row) => row.map((v) => (v ? 'x' : '.')).join(''));

  it('эллипс с чёткими краями, симметричный: 12×4 — строки по 8, 12, 12, 8 пикселей', () => {
    expect(rows(shadowMask(12, 4))).toEqual([
      '..xxxxxxxx..',
      'xxxxxxxxxxxx',
      'xxxxxxxxxxxx',
      '..xxxxxxxx..',
    ]);
    const mask = rows(shadowMask(9, 3));
    expect(mask).toEqual([...mask].reverse());
    expect(mask.map((row) => [...row].reverse().join(''))).toEqual(mask);
  });

  it('центр тени — на точке привязки со сдвигом', () => {
    expect(shadowOrigin({ width: 12, height: 4 })).toEqual({ x: -6, y: -2 });
    expect(shadowOrigin({ width: 9, height: 3, x: 1, y: 1 })).toEqual({ x: -3, y: 0 });
  });

  it('проверка: размер, сдвиг, тень шире, чем выше; у тайлов и значков тени нет', () => {
    expect(validateSprite(stone({ shadow: { width: 6, height: 2, x: 1 } }), TEST)).toEqual([]);
    expect(validateSprite(stone({ shadow: { width: 0, height: 2 } }), TEST)).toEqual([
      'спрайт «stone»: тень: размер 0×2 — нужны целые числа от 1 до 256',
    ]);
    expect(validateSprite(stone({ shadow: { width: 4, height: 2, x: 0.5 } }), TEST)).toEqual([
      'спрайт «stone»: тень: сдвиг (0.5, 0) — нужны целые числа',
    ]);
    expect(validateSprite(stone({ shadow: { width: 2, height: 4 } }), TEST)).toEqual([
      'спрайт «stone»: тень 2×4: тень лежит на земле — она шире, чем выше',
    ]);
    expect(validateSprite(stone({ kind: 'icon', shadow: { width: 4, height: 2 } }), TEST)).toEqual([
      'спрайт «stone»: тень: у вида «icon» тени не бывает',
    ]);
  });
});
