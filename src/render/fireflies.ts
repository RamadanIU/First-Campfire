/**
 * Fireflies on the map (step 1.5, ADR-018): the night swarms of src/sim/systems/fireflies.ts drawn
 * as glowing points over the world. They are drawn after the light of the time of day — they shine
 * by themselves and are not dimmed by the night. A lit firefly is a bright core with a faint cross
 * of glow around it; an unlit one is a dark speck. They fly smoothly between ticks (`alpha`).
 */
import { PALETTE, type Rgb } from '../art/palette.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import type { Firefly } from '../sim/systems/fireflies.ts';
import type { PixelRect } from './mapRenderer.ts';

/** Colours of the palette: the core of the light, its glow, a firefly with the light off. */
function color(ramp: string, shade: number): Rgb {
  return PALETTE.ramps.get(ramp)![shade]!;
}
const CORE = color('fire', 3);
const GLOW = color('leaf', 4);
const DARK = color('leaf', 0);

const css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r},${g},${b},${alpha})`;

/** Where a firefly is drawn, world pixels (whole), between the last two ticks by `alpha`. */
export function fireflyAt(fly: Firefly, alpha: number): { x: number; y: number } {
  return {
    x: Math.floor((fly.prevX + (fly.x - fly.prevX) * alpha) * TILE_SIZE),
    y: Math.floor((fly.prevY + (fly.y - fly.prevY) * alpha) * TILE_SIZE),
  };
}

/** Draw the swarm over the part `view` of the world (its corner at (0, 0) of `ctx`). */
export function drawFireflies(
  ctx: CanvasRenderingContext2D,
  view: PixelRect,
  swarm: readonly Firefly[],
  alpha: number,
): void {
  for (const fly of swarm) {
    const at = fireflyAt(fly, alpha);
    const x = at.x - view.x;
    const y = at.y - view.y;
    if (x < -2 || y < -2 || x > view.width + 2 || y > view.height + 2) continue;
    if (fly.lit) {
      ctx.fillStyle = css(GLOW, 0.18);
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = css(GLOW, 0.5);
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
      ctx.fillStyle = css(CORE);
      ctx.fillRect(x, y, 1, 1);
    } else {
      ctx.fillStyle = css(DARK, 0.6);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
