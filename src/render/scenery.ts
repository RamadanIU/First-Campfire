/**
 * Drawing a piece of the world from sprites: the ground, then every shadow, then objects and
 * people from the back to the front, then signs over heads (docs/ART.md, «Сборка картинки»).
 *
 *   - Shadows lie on the ground under everything that stands: they are drawn opaque into one
 *     layer which is put on the ground once with the shadow colour's opacity, so overlapping
 *     shadows merge instead of darkening twice.
 *   - Depth: what stands lower on the screen (larger anchor y) is closer to the viewer and is
 *     drawn later. Ties keep the order of the list, so the picture never flickers.
 *   - Signs (thought bubbles) are drawn over everything.
 *
 * Used by the style sheet and the title; the world scene of stage 1 does the same per chunk.
 */
import type { PaletteSwap } from '../art/palette.ts';
import type { SpriteSheet } from './spriteSheet.ts';

export interface Placement {
  readonly sprite: string;
  /** Anchor position in world pixels (whole numbers). */
  readonly x: number;
  readonly y: number;
  readonly animation?: string;
  readonly swap?: PaletteSwap;
  /** Shift of this object's animation clock, ms: neighbouring trees do not sway in step. */
  readonly phase?: number;
  /** Draw over everything (thought bubbles), not by depth. */
  readonly over?: boolean;
}

/** Indices of `items` in drawing order: by depth (anchor y, then x), signs last. */
export function drawOrder(items: readonly Placement[]): number[] {
  return items
    .map((_, index) => index)
    .sort((a, b) => {
      const p = items[a]!;
      const q = items[b]!;
      return Number(p.over ?? false) - Number(q.over ?? false) || p.y - q.y || p.x - q.x || a - b;
    });
}

export interface Scenery {
  /** Draw `items` (and the ground, if given) onto `ctx` at one canvas pixel per world pixel. */
  draw(
    ctx: CanvasRenderingContext2D,
    ground: CanvasImageSource | null,
    items: readonly Placement[],
    timeMs: number,
  ): void;
}

export function createScenery(sheet: SpriteSheet, width: number, height: number): Scenery {
  const shadows = document.createElement('canvas');
  shadows.width = width;
  shadows.height = height;
  const shadowCtx = shadows.getContext('2d')!;

  return {
    draw(ctx, ground, items, timeMs) {
      ctx.imageSmoothingEnabled = false;
      if (ground) ctx.drawImage(ground, 0, 0);

      shadowCtx.clearRect(0, 0, width, height);
      let anyShadow = false;
      for (const item of items) {
        if (!item.over)
          anyShadow =
            sheet.drawShadow(shadowCtx, item.sprite, item.x, item.y, { opaque: true }) || anyShadow;
      }
      if (anyShadow) {
        const alpha = ctx.globalAlpha;
        ctx.globalAlpha = alpha * sheet.shadowOpacity;
        ctx.drawImage(shadows, 0, 0);
        ctx.globalAlpha = alpha;
      }

      for (const index of drawOrder(items)) {
        const item = items[index]!;
        sheet.draw(ctx, item.sprite, item.x, item.y, {
          ...(item.animation === undefined ? {} : { animation: item.animation }),
          ...(item.swap === undefined ? {} : { swap: item.swap }),
          timeMs: timeMs + (item.phase ?? 0),
        });
      }
    },
  };
}
