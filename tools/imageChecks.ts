/**
 * Checks of screenshots by their pixels (used by ./screenshot.ts):
 *
 * - `crispness` — are the pixels sharp at an integer scale? At ×N every pixel of the game picture
 *   is an N×N square of one colour. Blurring (smoothing on, a fractional scale or position)
 *   mixes neighbours and breaks squares. The grid of squares may start anywhere (the picture is
 *   centred), so every shift 0…N−1 is tried and the best one is reported.
 * - `compareImages` — are two screenshots the same pixel for pixel, and if not, where they differ.
 * - `halfOf` — is a shot at ×0.5 every second pixel of a shot of the same place at ×1, without
 *   smoothing (step 1.2)? Smoothing would mix neighbours into colours the ×1 shot does not have
 *   in that place.
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

export interface HalfReport {
  /** Pixels of the small shot that have a pixel of the large one to compare with. */
  compared: number;
  /** Of them, pixels not equal to their pixel of the large shot — 0 means «every second pixel». */
  mismatched: number;
  /** The best alignment: small (x, y) ↔ large (2x + shiftX, 2y + shiftY). */
  shiftX: number;
  shiftY: number;
  /** The first mismatched pixel of the small shot, if any. */
  firstMismatch: { x: number; y: number } | null;
}

/**
 * Compare `small` (a shot at ×0.5) with `large` (the same place at ×1 in a window twice as large):
 * every pixel of `small` should be pixel (2x + shiftX, 2y + shiftY) of `large`. The centres of the
 * two shots match; the shifts around them (rounding of positions, which pixel of each pair) are
 * tried and the best one is reported.
 */
export function halfOf(small: RgbaImage, large: RgbaImage): HalfReport {
  const a = new Uint32Array(small.data.buffer, small.data.byteOffset, small.width * small.height);
  const b = new Uint32Array(large.data.buffer, large.data.byteOffset, large.width * large.height);
  // Centres: large.width / 2 = 2 · small.width / 2 + shift.
  const centreX = Math.round(large.width / 2 - small.width);
  const centreY = Math.round(large.height / 2 - small.height);
  let best: HalfReport | null = null;
  for (let shiftY = centreY - 2; shiftY <= centreY + 2; shiftY++) {
    for (let shiftX = centreX - 2; shiftX <= centreX + 2; shiftX++) {
      let compared = 0;
      let mismatched = 0;
      let firstMismatch: { x: number; y: number } | null = null;
      for (let y = 0; y < small.height; y++) {
        const ly = 2 * y + shiftY;
        if (ly < 0 || ly >= large.height) continue;
        for (let x = 0; x < small.width; x++) {
          const lx = 2 * x + shiftX;
          if (lx < 0 || lx >= large.width) continue;
          compared++;
          if (a[y * small.width + x] !== b[ly * large.width + lx]) {
            mismatched++;
            firstMismatch ??= { x, y };
          }
        }
      }
      const report = { compared, mismatched, shiftX, shiftY, firstMismatch };
      if (
        best === null ||
        report.mismatched + (small.width * small.height - report.compared) <
          best.mismatched + (small.width * small.height - best.compared)
      )
        best = report;
    }
  }
  return best!;
}
