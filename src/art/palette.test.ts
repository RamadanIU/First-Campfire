import { describe, expect, it } from 'vitest';
import {
  createPalette,
  luma,
  PALETTE,
  type PaletteSwap,
  parseColorName,
  parseHex,
  RAMPS,
  type RampDef,
  resolveAlpha,
  resolveColor,
  swapKey,
  toHex,
  validatePalette,
  validateSwap,
} from './palette.ts';

/** A small palette for tests, independent from the game's colours. */
const TEST = createPalette([
  { name: 'red', title: 'красный', colors: ['#400000', '#800000', '#ff0000'] },
  { name: 'blue', title: 'синий', colors: ['#000040', '#000080', '#0000ff'] },
  { name: 'gray', title: 'серый', colors: ['#202020', '#808080'] },
]);

describe('палитра игры', () => {
  it('без ошибок: имена, формат цветов, ряды от тёмного к светлому, цвета не повторяются', () => {
    expect(validatePalette(RAMPS)).toEqual([]);
  });

  it('каждый ряд действительно светлеет от первого цвета к последнему', () => {
    for (const ramp of RAMPS) {
      const brightness = ramp.colors.map((hex) => luma(parseHex(hex)));
      expect(brightness, ramp.name).toEqual([...brightness].sort((a, b) => a - b));
    }
  });

  it('мастер-палитра GDD §10.1: около 64 цветов мира, плюс тень и служебные', () => {
    const count = (names: string[]) =>
      RAMPS.filter((ramp) => names.includes(ramp.name)).reduce((n, r) => n + r.colors.length, 0);
    // Seasonal shifts (step 1.10) are swap tables over the master palette, not part of it (GDD §10.1).
    const all = RAMPS.filter((ramp: RampDef) => !ramp.season).reduce(
      (n, ramp) => n + ramp.colors.length,
      0,
    );
    const world = all - count(['shadow', 'ui']);
    // 69 colours of step 0.4 (ADR-013) + a highlight for each of the five hair colours (ADR-033).
    expect(world).toBeGreaterThanOrEqual(56);
    expect(world).toBeLessThanOrEqual(76);
  });

  it('шесть тонов кожи и пять цветов волос — ряды одной длины, подменяют друг друга', () => {
    const ramps = (prefix: string) =>
      [...PALETTE.ramps.entries()].filter(([name]) => name.startsWith(prefix));
    const skins = ramps('skin_');
    const hair = ramps('hair_');
    expect(skins).toHaveLength(6);
    expect(hair).toHaveLength(5);
    for (const group of [skins, hair]) {
      expect(new Set(group.map(([, colors]) => colors.length)).size).toBe(1);
      const [first] = group[0]!;
      for (const [name] of group)
        expect(validateSwap(PALETTE, { [first]: name } as PaletteSwap)).toEqual([]);
    }
  });

  it('есть все материалы карточки шага 0.4: земля, зелень, вода, дерево, камень, огонь, шкуры', () => {
    for (const name of [
      'grass',
      'dirt',
      'sand',
      'water',
      'leaf',
      'bark',
      'stone',
      'fire',
      'hide',
      'bone',
      'ink',
      'ui',
    ]) {
      expect(PALETTE.ramps.has(name), name).toBe(true);
    }
  });

  it('полупрозрачен только цвет тени', () => {
    const translucent = [...PALETTE.alphas.entries()].filter(([, alpha]) => alpha < 255);
    expect(translucent.map(([name]) => name)).toEqual(['shadow']);
    expect(translucent[0]![1]).toBeGreaterThan(40);
    expect(translucent[0]![1]).toBeLessThan(140);
  });
});

describe('цвета', () => {
  it('hex ↔ RGB туда и обратно', () => {
    expect(parseHex('#5d8f41')).toEqual([0x5d, 0x8f, 0x41]);
    expect(toHex([0x5d, 0x8f, 0x41])).toBe('#5d8f41');
    expect(toHex([0, 0, 0])).toBe('#000000');
    expect(toHex([255, 255, 255])).toBe('#ffffff');
  });

  it('имя цвета — «ряд.номер»', () => {
    expect(parseColorName('grass.2')).toEqual({ ramp: 'grass', shade: 2 });
    expect(parseColorName('skin_dark.0')).toEqual({ ramp: 'skin_dark', shade: 0 });
    expect(parseColorName('grass')).toBeNull();
    expect(parseColorName('grass.-1')).toBeNull();
    expect(parseColorName('Grass.1')).toBeNull();
  });

  it('цвет по имени, с подменой рядов и без', () => {
    expect(resolveColor(TEST, 'red.2')).toEqual([255, 0, 0]);
    expect(resolveColor(TEST, 'red.2', { red: 'blue' } as PaletteSwap)).toEqual([0, 0, 255]);
    expect(resolveColor(TEST, 'gray.1', { red: 'blue' } as PaletteSwap)).toEqual([128, 128, 128]);
    expect(resolveColor(TEST, 'red.3')).toBeNull();
    expect(resolveColor(TEST, 'green.0')).toBeNull();
  });

  it('прозрачность цвета: у обычных рядов 255, у полупрозрачного — своя, с учётом подмены', () => {
    const glass = createPalette([
      { name: 'red', title: '', colors: ['#400000'] },
      { name: 'mist', title: '', colors: ['#808080'], alpha: 0.5 },
    ]);
    expect(resolveAlpha(glass, 'red.0')).toBe(255);
    expect(resolveAlpha(glass, 'mist.0')).toBe(128);
    expect(resolveAlpha(glass, 'red.0', { red: 'mist' } as PaletteSwap)).toBe(128);
    expect(resolveAlpha(glass, 'red.1')).toBeNull();
  });

  it('подмена применяется один раз, не по цепочке: {red→blue, blue→red} меняет их местами', () => {
    const swap = { red: 'blue', blue: 'red' } as PaletteSwap;
    expect(resolveColor(TEST, 'red.1', swap)).toEqual([0, 0, 128]);
    expect(resolveColor(TEST, 'blue.1', swap)).toEqual([128, 0, 0]);
  });
});

describe('проверка палитры называет ряд и цвет', () => {
  const check = (ramps: RampDef[]) => validatePalette(ramps);

  it('плохое имя, повтор имени, пустой ряд', () => {
    expect(
      check([
        { name: 'Bad Name', title: '', colors: ['#101010'] },
        { name: 'a', title: '', colors: ['#202020'] },
        { name: 'a', title: '', colors: ['#303030'] },
        { name: 'empty', title: '', colors: [] },
      ]),
    ).toEqual([
      'палитра, ряд «Bad Name»: имя должно быть snake_case латиницей (a–z, 0–9, _)',
      'палитра, ряд «a»: такое имя ряда уже есть',
      'палитра, ряд «empty»: ряд пуст',
    ]);
  });

  it('цвет не в формате #rrggbb', () => {
    expect(check([{ name: 'a', title: '', colors: ['#FFF', 'red'] }])).toEqual([
      'палитра, ряд «a»: цвет a.0 = «#FFF» — нужен вид #rrggbb строчными буквами',
      'палитра, ряд «a»: цвет a.1 = «red» — нужен вид #rrggbb строчными буквами',
    ]);
  });

  it('ряд темнеет вместо того, чтобы светлеть', () => {
    expect(check([{ name: 'a', title: '', colors: ['#101010', '#808080', '#404040'] }])).toEqual([
      'палитра, ряд «a»: a.2 #404040 не светлее предыдущего #808080 — ряд идёт от тёмного к светлому',
    ]);
  });

  it('один цвет в двух местах', () => {
    expect(
      check([
        { name: 'a', title: '', colors: ['#101010', '#808080'] },
        { name: 'b', title: '', colors: ['#808080'] },
      ]),
    ).toEqual(['палитра, ряд «b»: цвет b.0 #808080 повторяет a.1']);
  });

  it('прозрачность ряда — число больше 0 и меньше 1', () => {
    expect(check([{ name: 'a', title: '', colors: ['#101010'], alpha: 0.4 }])).toEqual([]);
    expect(check([{ name: 'a', title: '', colors: ['#101010'], alpha: 1 }])).toEqual([
      'палитра, ряд «a»: прозрачность 1 — нужно число больше 0 и меньше 1 (или не указывать)',
    ]);
    expect(check([{ name: 'a', title: '', colors: ['#101010'], alpha: 0 }])).toHaveLength(1);
  });

  it('палитра с ошибками не создаётся', () => {
    expect(() => createPalette([{ name: 'a', title: '', colors: ['#fff'] }])).toThrow(
      /Палитра с ошибками:\nпалитра, ряд «a»/,
    );
  });
});

describe('подмена рядов', () => {
  it('ряды должны существовать и быть одной длины', () => {
    expect(validateSwap(TEST, { red: 'blue' } as PaletteSwap)).toEqual([]);
    expect(validateSwap(TEST, { red: 'gray' } as PaletteSwap)).toEqual([
      'подмена «red → gray»: в рядах разное число цветов (3 и 2)',
    ]);
    expect(validateSwap(TEST, { red: 'green' } as PaletteSwap)).toEqual([
      'подмена «red → green»: в палитре нет ряда «green»',
    ]);
    expect(validateSwap(TEST, { pink: 'red' } as PaletteSwap)).toEqual([
      'подмена «pink → red»: в палитре нет ряда «pink»',
    ]);
  });

  it('ключ подмены не зависит от порядка и пропускает пустые замены', () => {
    const a = { red: 'blue', gray: 'gray' } as PaletteSwap;
    const b = { gray: 'gray', red: 'blue' } as PaletteSwap;
    expect(swapKey(a)).toBe('red>blue');
    expect(swapKey(a)).toBe(swapKey(b));
    expect(swapKey({})).toBe('');
    expect(swapKey({ blue: 'red', red: 'blue' } as PaletteSwap)).toBe('blue>red,red>blue');
  });

  it('ключ учитывает только ряды, которые есть в спрайте', () => {
    const swap = { red: 'blue', blue: 'red' } as PaletteSwap;
    expect(swapKey(swap, new Set(['gray']))).toBe('');
    expect(swapKey(swap, new Set(['red', 'gray']))).toBe('red>blue');
  });
});
