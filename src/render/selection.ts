/**
 * Marks of the observer (step 1.6), drawn into the picture of the world at one canvas pixel per
 * world pixel — over the light of the time of day, so they read at night, and as crisp as the
 * sprites at every zoom step:
 *
 *   - the chosen villager — four corners of a frame around its sprite, breathing out and in by a
 *     pixel (light bone with a dark edge: reads on grass, sand and water);
 *   - the place of an event the camera flew to — rings of whole pixels spreading from the tile
 *     for a few seconds (warm fire yellow with a dark edge).
 *
 * Colours are the palette's (src/art/palette.ts).
 */
import { PALETTE, resolveColor, toHex } from '../art/palette.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import type { PixelRect } from './mapRenderer.ts';

const color = (name: string) => toHex(resolveColor(PALETTE, name)!);
export const MARK_COLORS = {
  frame: color('bone.2'),
  place: color('fire.3'),
  edge: color('ink.0'),
} as const;

/** Length of an arm of a corner of the frame, px. */
const ARM = 4;
/** The frame breathes: one pixel out, one pixel in, each this long, ms. */
const BREATH_MS = 600;
/** How long the mark of a place stays, ms; a ring spreads in `RING_MS`. */
export const PLACE_MARK_MS = 3000;
const RING_MS = 1000;
const RING_RADII = [3, 11] as const;

/** A box in world pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function dot(ctx: CanvasRenderingContext2D, view: PixelRect, x: number, y: number): void {
  ctx.fillRect(x - view.x, y - view.y, 1, 1);
}

/**
 * Corners of a frame around `box` (a sprite's box in world pixels), a pixel or two away from it;
 * `timeMs` — presentation time (the frame breathes).
 */
export function drawSelection(
  ctx: CanvasRenderingContext2D,
  view: PixelRect,
  box: Box,
  timeMs: number,
): void {
  const gap = 2 + (Math.floor(timeMs / BREATH_MS) % 2);
  const left = Math.round(box.x) - gap;
  const top = Math.round(box.y) - gap;
  const right = Math.round(box.x + box.width) - 1 + gap;
  const bottom = Math.round(box.y + box.height) - 1 + gap;
  const corners = [
    [left, top, 1, 1],
    [right, top, -1, 1],
    [left, bottom, 1, -1],
    [right, bottom, -1, -1],
  ] as const;
  // The dark edge first: every pixel of the corner one pixel larger around.
  for (const [fill, grow] of [
    [MARK_COLORS.edge, 1],
    [MARK_COLORS.frame, 0],
  ] as const) {
    ctx.fillStyle = fill;
    for (const [x, y, sx, sy] of corners) {
      for (let i = 0; i < ARM; i++) {
        for (let g = -grow; g <= grow; g++) {
          for (let h = -grow; h <= grow; h++) {
            dot(ctx, view, x + sx * i + g, y + h);
            dot(ctx, view, x + g, y + sy * i + h);
          }
        }
      }
    }
  }
}

/** Whole pixels of a circle of `radius` around (cx, cy) (midpoint circle). */
export function circlePixels(cx: number, cy: number, radius: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  let x = radius;
  let y = 0;
  let error = 1 - radius;
  while (x >= y) {
    for (const [dx, dy] of [
      [x, y],
      [y, x],
      [-y, x],
      [-x, y],
      [-x, -y],
      [-y, -x],
      [y, -x],
      [x, -y],
    ] as const) {
      points.push({ x: cx + dx, y: cy + dy });
    }
    y++;
    if (error < 0) error += 2 * y + 1;
    else {
      x--;
      error += 2 * (y - x) + 1;
    }
  }
  return points;
}

/**
 * The mark of a place (`tile`): a ring spreading from the middle of the tile, again and again;
 * `ageMs` — how long ago the mark appeared (nothing after `PLACE_MARK_MS`).
 */
export function drawPlaceMark(
  ctx: CanvasRenderingContext2D,
  view: PixelRect,
  tile: { x: number; y: number },
  ageMs: number,
): void {
  if (ageMs < 0 || ageMs >= PLACE_MARK_MS) return;
  const cx = tile.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = tile.y * TILE_SIZE + TILE_SIZE / 2;
  const t = (ageMs % RING_MS) / RING_MS;
  const radius = Math.round(RING_RADII[0] + (RING_RADII[1] - RING_RADII[0]) * t);
  const ring = circlePixels(cx, cy, radius);
  ctx.fillStyle = MARK_COLORS.edge;
  for (const point of [...circlePixels(cx, cy, radius + 1), ...circlePixels(cx, cy, radius - 1)])
    dot(ctx, view, point.x, point.y);
  ctx.fillStyle = MARK_COLORS.place;
  for (const point of ring) dot(ctx, view, point.x, point.y);
}
