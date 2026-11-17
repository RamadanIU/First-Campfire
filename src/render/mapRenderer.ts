/**
 * The map of the world on a canvas (step 1.1): the ground by chunks, the shadows, the objects
 * from the back to the front (docs/ART.md, «Сборка картинки»).
 *
 *   - Ground: one ./terrainLayer.ts per chunk of the map (`chunkSize` tiles), each with its own
 *     cache of ripple states; a chunk without water has a single state.
 *   - Shadows: one layer for every object, drawn once (objects stand still) and put on the
 *     ground with the shadow colour's opacity, so overlapping shadows merge. The ground of a
 *     chunk with its shadows is cached as one picture per ripple state, so a frame costs one
 *     drawImage per chunk; the pictures are redone when objects appear or disappear.
 *   - Objects: sorted by depth once (anchor y, then x); rebuilt only when objects appear or
 *     disappear. Each object stands on its tile, shifted by a few pixels by its id so the forest
 *     does not look planted in rows, and sways with its own phase.
 *
 * Only reads the world. Draws one canvas pixel per world pixel; scaling is the caller's.
 */
import { TILE_SIZE } from '../art/sprite.ts';
import { type TerrainArt, terrainStateTimes } from '../art/terrain.ts';
import { chunkGrid, chunkRect, groundAt } from '../sim/map.ts';
import { defOf, type MapObject } from '../sim/objects.ts';
import type { World } from '../sim/world.ts';
import { drawOrder, type Placement } from './scenery.ts';
import type { SpriteSheet } from './spriteSheet.ts';
import { createTerrainLayer, type TerrainLayer } from './terrainLayer.ts';

/** A rectangle of the world in pixels. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapRenderer {
  /** Size of the whole map in pixels. */
  readonly width: number;
  readonly height: number;
  /** Compose every state of the ground of every chunk now (at scene start). */
  prepare(): void;
  /**
   * Draw the part `view` of the map (world pixels) at presentation time `timeMs`: the view's
   * top-left corner lands on (0, 0) of `ctx`.
   */
  draw(ctx: CanvasRenderingContext2D, timeMs: number, view: PixelRect): void;
}

/** Where on its tile an object stands: the anchor's offset from the tile's top-left corner. */
const ANCHOR = { x: TILE_SIZE / 2, y: TILE_SIZE - 3 } as const;
/** How far an object may stand from the middle of its tile, px (by its id). */
const SHIFT = { x: 3, y: 2 } as const;
/** Sway phases spread over this many ms (longer than any sway cycle). */
const PHASES_MS = 2400;

/** Cheap deterministic hash → [0, 1). Presentation only; the simulation has its own RNG. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Shown {
  readonly object: MapObject;
  readonly placement: Placement;
  /** The sprite's box in world pixels, for skipping what is out of view. */
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Where and how an object is drawn: its sprite on its tile, shifted and phased by its id. */
export function placementOf(object: MapObject): Placement {
  const sprite = defOf(object).sprite;
  const shift = (salt: number, range: number) =>
    Math.floor(hash(object.id, salt) * (2 * range + 1)) - range;
  return {
    sprite,
    x: object.x * TILE_SIZE + ANCHOR.x + shift(1, SHIFT.x),
    y: object.y * TILE_SIZE + ANCHOR.y + shift(2, SHIFT.y),
    phase: Math.floor(hash(object.id, 3) * PHASES_MS),
  };
}

export function createMapRenderer(sheet: SpriteSheet, art: TerrainArt, world: World): MapRenderer {
  const { map } = world;
  const width = map.width * TILE_SIZE;
  const height = map.height * TILE_SIZE;
  const at = (x: number, y: number) => groundAt(map, x, y);

  const grid = chunkGrid(map);
  const chunks: {
    layer: TerrainLayer;
    x: number;
    y: number;
    /** Ground with shadows, by state of the ground. */
    pictures: Map<string, HTMLCanvasElement>;
  }[] = [];
  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      const rect = chunkRect(map, cx, cy);
      chunks.push({
        layer: createTerrainLayer(art, at, rect.width, rect.height, rect),
        x: rect.x * TILE_SIZE,
        y: rect.y * TILE_SIZE,
        pictures: new Map(),
      });
    }
  }
  const chunkPx = map.chunkSize * TILE_SIZE;

  const shadows = document.createElement('canvas');
  shadows.width = width;
  shadows.height = height;
  const shadowCtx = shadows.getContext('2d')!;

  let shown: Shown[] = [];
  /** What the sorted list was built from: rebuild when objects appear or disappear. */
  let builtFor = '';

  function rebuild(): void {
    const objects = world.objects.list;
    const placements = objects.map(placementOf);
    shown = drawOrder(placements).map((index) => {
      const placement = placements[index]!;
      const entry = sheet.entry(placement.sprite);
      const left = placement.x - entry.anchor.x;
      const top = placement.y - entry.anchor.y;
      return {
        object: objects[index]!,
        placement,
        left,
        top,
        right: left + entry.width,
        bottom: top + entry.height,
      };
    });
    shadowCtx.clearRect(0, 0, width, height);
    for (const { placement } of shown) {
      sheet.drawShadow(shadowCtx, placement.sprite, placement.x, placement.y, { opaque: true });
    }
    builtFor = `${world.objects.nextId}/${objects.length}`;
    for (const chunk of chunks) chunk.pictures.clear();
  }

  /** The ground of a chunk with the shadows on it, at `timeMs`. */
  function pictureOf(chunk: (typeof chunks)[number], timeMs: number): HTMLCanvasElement {
    const key = chunk.layer.stateAt(timeMs);
    let picture = chunk.pictures.get(key);
    if (!picture) {
      picture = document.createElement('canvas');
      picture.width = chunkPx;
      picture.height = chunkPx;
      const ctx = picture.getContext('2d')!;
      ctx.drawImage(chunk.layer.canvasAt(timeMs), 0, 0);
      ctx.globalAlpha = sheet.shadowOpacity;
      ctx.drawImage(shadows, chunk.x, chunk.y, chunkPx, chunkPx, 0, 0, chunkPx, chunkPx);
      chunk.pictures.set(key, picture);
    }
    return picture;
  }

  return {
    width,
    height,
    prepare() {
      rebuild();
      for (const chunk of chunks) {
        chunk.layer.composeAll();
        for (const timeMs of terrainStateTimes(art)) pictureOf(chunk, timeMs);
      }
    },
    draw(ctx, timeMs, view) {
      if (builtFor !== `${world.objects.nextId}/${world.objects.list.length}`) rebuild();
      ctx.imageSmoothingEnabled = false;
      const right = view.x + view.width;
      const bottom = view.y + view.height;

      for (const chunk of chunks) {
        if (chunk.x >= right || chunk.y >= bottom) continue;
        if (chunk.x + chunkPx <= view.x || chunk.y + chunkPx <= view.y) continue;
        ctx.drawImage(chunk.layer.canvasAt(timeMs), chunk.x - view.x, chunk.y - view.y);
      }

      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * sheet.shadowOpacity;
      ctx.drawImage(
        shadows,
        view.x,
        view.y,
        view.width,
        view.height,
        0,
        0,
        view.width,
        view.height,
      );
      ctx.globalAlpha = alpha;

      for (const item of shown) {
        if (
          item.left >= right ||
          item.top >= bottom ||
          item.right <= view.x ||
          item.bottom <= view.y
        ) {
          continue;
        }
        const { placement, object } = item;
        const entry = sheet.entry(placement.sprite);
        sheet.draw(ctx, placement.sprite, placement.x - view.x, placement.y - view.y, {
          animation: entry.animations.has(object.state) ? object.state : entry.defaultAnimation,
          timeMs: timeMs + (placement.phase ?? 0),
        });
      }
    },
  };
}
