import { describe, expect, it } from 'vitest';
import { compareImages, crispness, halfOf } from './imageChecks.ts';
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

describe('×0,5 — каждый второй пиксель', () => {
  /** A «×1 shot» w×h of varied colours: every pixel its own. */
  function varied(width: number, height: number): RgbaImage {
    const data = new Uint8Array(width * height * 4);
    const pixels = new Uint32Array(data.buffer);
    for (let i = 0; i < pixels.length; i++) pixels[i] = 0xff000000 + ((i * 2654435761) >>> 8);
    return { width, height, data };
  }
  /** Half of `large`: pixel (2x + px, 2y + py), or the average of each 2×2 (smoothing). */
  function half(large: RgbaImage, px: number, py: number, smooth = false): RgbaImage {
    const width = large.width / 2;
    const height = large.height / 2;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < 4; c++) {
          const at = (lx: number, ly: number) => large.data[(ly * large.width + lx) * 4 + c]!;
          data[(y * width + x) * 4 + c] = smooth
            ? Math.round(
                (at(2 * x, 2 * y) +
                  at(2 * x + 1, 2 * y) +
                  at(2 * x, 2 * y + 1) +
                  at(2 * x + 1, 2 * y + 1)) /
                  4,
              )
            : at(Math.min(large.width - 1, 2 * x + px), Math.min(large.height - 1, 2 * y + py));
        }
      }
    }
    return { width, height, data };
  }

  it('каждый второй пиксель (любой из пары) — ни одного расхождения, сдвиг найден', () => {
    const large = varied(40, 24);
    for (const [px, py] of [
      [0, 0],
      [1, 0],
      [1, 1],
    ] as const) {
      const report = halfOf(half(large, px, py), large);
      expect(report).toMatchObject({ mismatched: 0, shiftX: px, shiftY: py, firstMismatch: null });
      expect(report.compared).toBe(20 * 12);
    }
  });

  it('сглаживание (среднее 2×2) — почти все пиксели не совпадают', () => {
    const large = varied(40, 24);
    const report = halfOf(half(large, 0, 0, true), large);
    expect(report.mismatched).toBeGreaterThan(200);
    expect(report.firstMismatch).not.toBeNull();
  });
});
