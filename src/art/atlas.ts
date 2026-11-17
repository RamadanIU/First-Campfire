/**
 * Atlas: every frame of every sprite packed into one image, built once at start-up.
 *
 * Packing and composing the pixels are pure functions (they run in tests under Node); turning
 * the result into a canvas and drawing from it is the renderer's job (src/render/spriteSheet.ts).
 * Frames are separated by a transparent 1-pixel gap so that neighbours can never bleed into
 * each other when drawn.
 */
import type { Palette, PaletteSwap } from './palette.ts';
import { rasterizeSprite } from './raster.ts';
import type { SpriteDef } from './sprite.ts';

export interface AtlasRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface AtlasAnimation {
  readonly frames: readonly AtlasRect[];
  /** How long each frame is shown, ms. */
  readonly durations: readonly number[];
}

export interface AtlasShadow {
  readonly rect: AtlasRect;
  /** The point inside the shadow image where the sprite's anchor lands. */
  readonly anchor: { readonly x: number; readonly y: number };
  /** Opacity to draw the (opaque) shadow image with, 0…255. */
  readonly alpha: number;
}

export interface AtlasEntry {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly anchor: { readonly x: number; readonly y: number };
  /** The first animation of the sprite. */
  readonly defaultAnimation: string;
  readonly animations: ReadonlyMap<string, AtlasAnimation>;
  /** The soft shadow, packed into the same atlas; null if the sprite has none. */
  readonly shadow: AtlasShadow | null;
}

export interface Atlas {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel. */
  readonly pixels: Uint8ClampedArray;
  readonly sprites: ReadonlyMap<string, AtlasEntry>;
  /** Animation frames in the atlas (shadows not counted). */
  readonly frameCount: number;
}

/** Transparent gap around every frame, px. */
export const ATLAS_GAP = 1;

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

/**
 * Shelf packing: rectangles sorted by height go left to right in rows ("shelves").
 * Deterministic — the same sizes always give the same layout. Returns positions in input order.
 */
export function packRects(
  sizes: readonly { readonly w: number; readonly h: number }[],
  gap = ATLAS_GAP,
): { width: number; height: number; rects: AtlasRect[] } {
  const cell = sizes.map(({ w, h }) => ({ w: w + gap, h: h + gap }));
  const area = cell.reduce((sum, { w, h }) => sum + w * h, 0);
  const widest = cell.reduce((max, { w }) => Math.max(max, w), 0);
  const width = Math.max(nextPowerOfTwo(Math.ceil(Math.sqrt(area))), nextPowerOfTwo(widest + gap));

  const order = sizes
    .map((_, index) => index)
    .sort((a, b) => cell[b]!.h - cell[a]!.h || cell[b]!.w - cell[a]!.w || a - b);
  const rects: AtlasRect[] = new Array(sizes.length);
  let x = gap;
  let y = gap;
  let shelf = 0;
  for (const index of order) {
    const { w, h } = cell[index]!;
    if (x + w > width) {
      x = gap;
      y += shelf;
      shelf = 0;
    }
    rects[index] = { x, y, w: sizes[index]!.w, h: sizes[index]!.h };
    x += w;
    shelf = Math.max(shelf, h);
  }
  return { width, height: sizes.length === 0 ? 0 : y + shelf, rects };
}

/** Rasterize `defs` (recoloured by `swap`) and pack all their frames into one image. */
export function buildAtlas(
  defs: readonly SpriteDef[],
  palette: Palette,
  swap: PaletteSwap = {},
): Atlas {
  const rasters = defs.map((def) => rasterizeSprite(def, palette, swap));
  const frames = rasters.flatMap((sprite) => sprite.animations.flatMap((a) => a.frames));
  const shadows = rasters.flatMap((sprite) => (sprite.shadow ? [sprite.shadow] : []));
  const images = [...frames, ...shadows];
  const layout = packRects(images.map((image) => ({ w: image.width, h: image.height })));
  const pixels = new Uint8ClampedArray(layout.width * layout.height * 4);
  images.forEach((frame, index) => {
    const rect = layout.rects[index]!;
    for (let row = 0; row < frame.height; row++) {
      const from = row * frame.width * 4;
      pixels.set(
        frame.pixels.subarray(from, from + frame.width * 4),
        ((rect.y + row) * layout.width + rect.x) * 4,
      );
    }
  });

  let next = 0;
  let nextShadow = frames.length;
  const sprites = new Map<string, AtlasEntry>();
  for (const sprite of rasters) {
    const animations = new Map<string, AtlasAnimation>();
    for (const animation of sprite.animations) {
      animations.set(animation.name, {
        frames: animation.frames.map(() => layout.rects[next++]!),
        durations: animation.durations,
      });
    }
    sprites.set(sprite.name, {
      name: sprite.name,
      width: sprite.width,
      height: sprite.height,
      anchor: sprite.anchor,
      defaultAnimation: sprite.animations[0]!.name,
      animations,
      shadow: sprite.shadow
        ? {
            rect: layout.rects[nextShadow++]!,
            anchor: sprite.shadow.anchor,
            alpha: sprite.shadow.alpha,
          }
        : null,
    });
  }
  return {
    width: layout.width,
    height: layout.height,
    pixels,
    sprites,
    frameCount: frames.length,
  };
}
