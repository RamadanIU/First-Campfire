import { describe, expect, it } from 'vitest';
import { createPalette, type PaletteSwap } from './palette.ts';
import { rasterizeSprite } from './raster.ts';
import type { SpriteDef } from './sprite.ts';

const TEST = createPalette([
  { name: 'red', title: '', colors: ['#400000', '#800000', '#ff0000'] },
  { name: 'blue', title: '', colors: ['#000040', '#000080', '#0000ff'] },
  { name: 'gray', title: '', colors: ['#202020', '#808080'] },
]);

const FLAG: SpriteDef = {
  name: 'flag',
  title: 'Флажок',
  kind: 'object',
  width: 3,
  height: 2,
  anchor: { x: 0, y: 2 },
  legend: { g: 'gray.0', r: 'red.2', R: 'red.1' } as unknown as SpriteDef['legend'],
  animations: {
    still: { frames: ['grR\ng..'], frameMs: 300 },
    wave: { frames: ['grR\ng..', 'gRr\ng..'] },
  },
};

/** Pixel (x, y) of a raster as [r, g, b, a]. */
function pixel(raster: { width: number; pixels: Uint8ClampedArray }, x: number, y: number) {
  const at = (y * raster.width + x) * 4;
  return [...raster.pixels.subarray(at, at + 4)];
}

describe('растеризатор', () => {
  it('переводит сетку в пиксели точно по палитре; «.» — прозрачный', () => {
    const sprite = rasterizeSprite(FLAG, TEST);
    const frame = sprite.animations[0]!.frames[0]!;
    expect(frame.width).toBe(3);
    expect(frame.height).toBe(2);
    expect(pixel(frame, 0, 0)).toEqual([0x20, 0x20, 0x20, 255]);
    expect(pixel(frame, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(frame, 2, 0)).toEqual([128, 0, 0, 255]);
    expect(pixel(frame, 0, 1)).toEqual([0x20, 0x20, 0x20, 255]);
    expect(pixel(frame, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(pixel(frame, 2, 1)).toEqual([0, 0, 0, 0]);
  });

  it('анимации и кадры — в порядке описания, с длительностями', () => {
    const sprite = rasterizeSprite(FLAG, TEST);
    expect(sprite.animations.map((a) => a.name)).toEqual(['still', 'wave']);
    expect(sprite.animations[0]!.durations).toEqual([300]);
    expect(sprite.animations[1]!.durations).toEqual([100, 100]);
    const [first, second] = sprite.animations[1]!.frames;
    expect(pixel(first!, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(second!, 1, 0)).toEqual([128, 0, 0, 255]);
    expect(sprite.anchor).toEqual({ x: 0, y: 2 });
  });

  it('перекраска меняет только подменённый ряд, сохраняя номер оттенка', () => {
    const base = rasterizeSprite(FLAG, TEST).animations[0]!.frames[0]!;
    const blue = rasterizeSprite(FLAG, TEST, { red: 'blue' } as PaletteSwap).animations[0]!
      .frames[0]!;
    expect(pixel(blue, 0, 0)).toEqual(pixel(base, 0, 0)); // gray untouched
    expect(pixel(blue, 1, 0)).toEqual([0, 0, 255, 255]); // red.2 → blue.2
    expect(pixel(blue, 2, 0)).toEqual([0, 0, 128, 255]); // red.1 → blue.1
    expect(pixel(blue, 1, 1)).toEqual([0, 0, 0, 0]); // transparency stays
  });

  it('одинаковый вход — одинаковые пиксели (чистая функция)', () => {
    const a = rasterizeSprite(FLAG, TEST).animations[1]!.frames[1]!.pixels;
    const b = rasterizeSprite(FLAG, TEST).animations[1]!.frames[1]!.pixels;
    expect(b).toEqual(a);
  });

  it('спрайт с ошибками не растеризуется: в исключении перечислены все ошибки', () => {
    const broken = { ...FLAG, animations: { still: { frames: ['grR\ng.', 'grX\ng..'] } } };
    expect(() => rasterizeSprite(broken, TEST)).toThrow(
      'Спрайт с ошибками:\n' +
        'спрайт «flag»: анимация «still», кадр 1, строка 2: длина 2, ожидалось 3 (ширина спрайта) — «g.»\n' +
        'спрайт «flag»: анимация «still», кадр 2, строка 1, столбец 3: символа «X» нет в легенде',
    );
  });

  it('подмена на ряд другой длины отвергается', () => {
    expect(() => rasterizeSprite(FLAG, TEST, { red: 'gray' } as PaletteSwap)).toThrow(
      'Спрайт «flag», подмена с ошибками:\nподмена «red → gray»: в рядах разное число цветов (3 и 2)',
    );
  });
});
