/**
 * Checks of screenshots by their pixels (used by ./screenshot.ts):
 *
 * - `crispness` — are the pixels sharp at an integer scale? At ×N every pixel of the game picture
 *   is an N×N square of one colour. Blurring (smoothing on, a fractional scale or position)
 *   mixes neighbours and breaks squares. The grid of squares may start anywhere (the picture is
 *   centred), so every shift 0…N−1 is tried and the best one is reported.
 * - `compareImages` — are two screenshots the same pixel for pixel, and if not, where they differ.
 *
 * Text and HTML interface are not pixel art: check crispness on frames with `ui=0`.
 */
import type { RgbaImage } from './png.ts';

export interface CrispReport {
  scale: number;
  /** Where the grid of squares starts (the best shift). */
  shiftX: number;
  shiftY: number;
  /** Whole squares on screen at that shift. */
  blocks: number;
  /** Squares with more than one colour — 0 means crisp. */
  mixed: number;
  /** Top-left corner of the first mixed square, if any. */
  firstMixed: { x: number; y: number } | null;
}

export function crispness(image: RgbaImage, scale: number): CrispReport {
  if (!Number.isInteger(scale) || scale < 2)
    throw new Error(`Масштаб — целое от 2, получено ${scale}`);
  const pixels = new Uint32Array(
    image.data.buffer,
    image.data.byteOffset,
    image.width * image.height,
  );
  let best: CrispReport | null = null;
  for (let shiftY = 0; shiftY < scale; shiftY++) {
    for (let shiftX = 0; shiftX < scale; shiftX++) {
      const report = countMixed(pixels, image.width, image.height, scale, shiftX, shiftY);
      if (best === null || report.mixed < best.mixed) best = report;
      if (best.mixed === 0) return best;
    }
  }
  return best!;
}

function countMixed(
  pixels: Uint32Array,
  width: number,
  height: number,
  scale: number,
  shiftX: number,
  shiftY: number,
): CrispReport {
  let blocks = 0;
  let mixed = 0;
  let firstMixed: { x: number; y: number } | null = null;
  for (let top = shiftY; top + scale <= height; top += scale) {
    for (let left = shiftX; left + scale <= width; left += scale) {
      blocks++;
      const colour = pixels[top * width + left];
      let uniform = true;
      for (let y = top; y < top + scale && uniform; y++) {
        for (let x = left; x < left + scale; x++) {
          if (pixels[y * width + x] !== colour) {
            uniform = false;
            break;
          }
        }
      }
      if (!uniform) {
        mixed++;
        firstMixed ??= { x: left, y: top };
      }
    }
  }
  return { scale, shiftX, shiftY, blocks, mixed, firstMixed };
}

export interface Difference {
  /** Same width and height — otherwise nothing else is compared. */
  sameSize: boolean;
  /** Pixels whose colour differs. */
  differing: number;
  /** The rectangle that holds every differing pixel, if any. */
  box: { x: number; y: number; width: number; height: number } | null;
}

export function compareImages(a: RgbaImage, b: RgbaImage): Difference {
  if (a.width !== b.width || a.height !== b.height)
    return { sameSize: false, differing: 0, box: null };
  const left = new Uint32Array(a.data.buffer, a.data.byteOffset, a.width * a.height);
  const right = new Uint32Array(b.data.buffer, b.data.byteOffset, b.width * b.height);
  let differing = 0;
  let minX = a.width;
  let minY = a.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const index = y * a.width + x;
      if (left[index] === right[index]) continue;
      differing++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    sameSize: true,
    differing,
    box:
      differing === 0
        ? null
        : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}
