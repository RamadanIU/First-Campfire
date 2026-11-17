import { describe, expect, it } from 'vitest';
import { compareImages, crispness } from './imageChecks.ts';
import type { RgbaImage } from './png.ts';

/** A picture of `small` (rows of colour numbers) scaled ×scale and placed at (left, top). */
function scaled(
  small: number[][],
  scale: number,
  left: number,
  top: number,
  width: number,
  height: number,
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  const pixels = new Uint32Array(data.buffer);
  pixels.fill(0xff102030); // background
  for (const [y, row] of small.entries())
    for (const [x, colour] of row.entries())
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++)
          pixels[(top + y * scale + dy) * width + left + x * scale + dx] = 0xff000000 + colour;
  return { width, height, data };
}

const SMALL = [
  [1, 2, 3],
  [4, 5, 6],
];

describe('резкость пикселей', () => {
  it('картинка ×3 со сдвигом (1, 2) — резкая, сдвиг найден', () => {
    const report = crispness(scaled(SMALL, 3, 1, 2, 14, 11), 3);
    expect(report).toMatchObject({ scale: 3, shiftX: 1, shiftY: 2, mixed: 0, firstMixed: null });
    expect(report.blocks).toBe(4 * 3); // whole 3×3 squares from (1, 2) in 14×11
  });

  it('один «размытый» пиксель — один смешанный квадрат, указано где', () => {
    const image = scaled(SMALL, 4, 0, 0, 12, 8);
    new Uint32Array(image.data.buffer)[5 * 12 + 6] = 0xff777777; // inside square (4, 4)
    const report = crispness(image, 4);
    expect(report.mixed).toBe(1);
    expect(report.firstMixed).toEqual({ x: 4, y: 4 });
  });

  it('картинка ×2 не резкая как ×4', () => {
    expect(crispness(scaled(SMALL, 2, 0, 0, 12, 8), 4).mixed).toBeGreaterThan(0);
  });

  it('масштаб — целое от 2', () => {
    const image = scaled(SMALL, 2, 0, 0, 6, 4);
    expect(() => crispness(image, 1)).toThrow('целое от 2');
    expect(() => crispness(image, 2.5)).toThrow('целое от 2');
  });
});

describe('сравнение снимков', () => {
  it('одинаковые — 0 отличий', () => {
    const a = scaled(SMALL, 2, 1, 1, 10, 6);
    expect(compareImages(a, scaled(SMALL, 2, 1, 1, 10, 6))).toEqual({
      sameSize: true,
      differing: 0,
      box: null,
    });
  });

  it('отличия — число пикселей и рамка вокруг них', () => {
    const a = scaled(SMALL, 2, 0, 0, 10, 6);
    const b = scaled(SMALL, 2, 0, 0, 10, 6);
    const pixels = new Uint32Array(b.data.buffer);
    pixels[1 * 10 + 2] = 0xffffffff;
    pixels[4 * 10 + 7] = 0xffffffff;
    expect(compareImages(a, b)).toEqual({
      sameSize: true,
      differing: 2,
      box: { x: 2, y: 1, width: 6, height: 4 },
    });
  });

  it('разный размер — так и сказано', () => {
    expect(compareImages(scaled(SMALL, 2, 0, 0, 6, 4), scaled(SMALL, 2, 0, 0, 8, 4)).sameSize).toBe(
      false,
    );
  });
});
