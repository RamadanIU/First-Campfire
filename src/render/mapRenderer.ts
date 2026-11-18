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
 *   - Villagers (step 1.3, ./villagers.ts): they move, so every frame they are placed between the
 *     previous and the current tick (`alpha`) and drawn among the objects by depth — behind a
 *     tree of the row below, in front of one of the row above. Their shadows go into the shadow
 *     layer like everyone's (they merge with the shadows of trees instead of darkening twice):
 *     a «live» copy of the still layer, where the last frame's villager shadows are wiped
 *     (copied back from the still layer) and this frame's are drawn.
 *
 *   - Items (step 1.7, ./items.ts): stacks lying loose and the pile at the camp come and go, so
 *     like villagers they are placed every frame and drawn among the objects by depth, their
 *     shadows in the live layer (only those near the view: up to a hundred stacks lie about the
 *     map). A villager's load is drawn over its head, right after the villager.
 *
 * Signs (step 1.5) — bubbles of sleep over the sleepers — are drawn separately (`drawSigns`), after
 * the light of the time of day: they stay readable at night.
 *
 * Only reads the world. Draws one canvas pixel per world pixel; scaling is the caller's.
 */
import { TILE_SIZE } from '../art/sprite.ts';
import { type TerrainArt, terrainStateTimes } from '../art/terrain.ts';
import { DATA } from '../data/index.ts';
import { TIME } from '../sim/calendar.ts';
import { chunkGrid, chunkRect, groundAt } from '../sim/map.ts';
import { defOf, type MapObject } from '../sim/objects.ts';
import type { World } from '../sim/world.ts';
import { type ItemPose, itemPoses, loadLook } from './items.ts';
import { drawOrder, type Placement } from './scenery.ts';
import type { SpriteSheet } from './spriteSheet.ts';
import { createTerrainLayer, type TerrainLayer } from './terrainLayer.ts';
import { strideOf, type VillagerPose, villagerPose } from './villagers.ts';

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
   * top-left corner lands on (0, 0) of `ctx`. Villagers stand between the previous and the
   * current tick by `alpha` (0…1, GameLoop.alpha; 1 — exactly at the current tick).
   */
  draw(ctx: CanvasRenderingContext2D, timeMs: number, view: PixelRect, alpha?: number): void;
  /**
   * Signs over the world, drawn after the light of the time of day (they are not lit): a bubble of
   * sleep over every sleeper (step 1.5). Same arguments as `draw`.
   */
  drawSigns(ctx: CanvasRenderingContext2D, timeMs: number, view: PixelRect, alpha?: number): void;
  /** Where and how every villager is drawn at `alpha` (hit tests, the debug overlay). */
  villagers(alpha: number): VillagerPose[];
}

/** Where the bubble of sleep floats: its tail tip from a sleeper's anchor, px (over the head). */
export const SLEEP_BUBBLE = { sprite: 'bubble_sleep', x: -3, y: -9 } as const;

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
  // The still shadows plus this frame's villagers (see the header).
  const live = document.createElement('canvas');
  live.width = width;
  live.height = height;
  const liveCtx = live.getContext('2d')!;
  /** Boxes of the villager shadows drawn into `live` last frame, world pixels. */
  let patched: PixelRect[] = [];

  // One frame of walking carries a villager this far: legs keep pace with the ground.
  const walkMs = sheet.entry('man').animations.get('walk_s')?.durations[0] ?? 200;
  const stride = strideOf(walkMs, DATA.balance.movement.walkTicksPerTile, TIME.ticksPerSecond);
  const posesAt = (alpha: number) =>
    world.villagers.list
      .map((villager) =>
        villagerPose(
          villager,
          alpha,
          stride,
          villager.load ? loadLook(villager.load.resource) : null,
        ),
      )
      .sort((a, b) => a.depth - b.depth || a.x - b.x || a.id - b.id);

  /** Items lying on tiles near `view` (a tile of margin), as they are drawn. */
  const itemsNear = (view: PixelRect): ItemPose[] => {
    const poses: ItemPose[] = [];
    const margin = 2 * TILE_SIZE;
    for (const item of world.items.list) {
      const px = item.x * TILE_SIZE;
      const py = item.y * TILE_SIZE;
      if (px + margin < view.x || py + margin < view.y) continue;
      if (px - margin > view.x + view.width || py - margin > view.y + view.height) continue;
      poses.push(...itemPoses(item));
    }
    return poses;
  };

  /** The live shadow layer for this frame: last frame's villagers and items wiped, these drawn. */
  function patchShadows(people: readonly { sprite: string; x: number; y: number }[]): void {
    for (const box of patched) {
      liveCtx.clearRect(box.x, box.y, box.width, box.height);
      liveCtx.drawImage(
        shadows,
        box.x,
        box.y,
        box.width,
        box.height,
        box.x,
        box.y,
        box.width,
        box.height,
      );
    }
    patched = [];
    for (const person of people) {
      const shadow = sheet.entry(person.sprite).shadow;
      if (!shadow) continue;
      sheet.drawShadow(liveCtx, person.sprite, person.x, person.y, { opaque: true });
      // A pixel of margin around the drawn box (drawShadow rounds the corner).
      patched.push({
        x: Math.floor(person.x - shadow.anchor.x) - 1,
        y: Math.floor(person.y - shadow.anchor.y) - 1,
        width: shadow.rect.w + 2,
        height: shadow.rect.h + 2,
      });
    }
  }

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
    liveCtx.clearRect(0, 0, width, height);
    liveCtx.drawImage(shadows, 0, 0);
    patched = [];
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
    villagers: posesAt,
    drawSigns(ctx, timeMs, view, tickAlpha = 1) {
      for (const person of posesAt(tickAlpha)) {
        if (!person.asleep) continue;
        const x = person.x + SLEEP_BUBBLE.x - view.x;
        const y = person.y + SLEEP_BUBBLE.y - view.y;
        if (
          x < -TILE_SIZE ||
          y < -TILE_SIZE ||
          x > view.width + TILE_SIZE ||
          y > view.height + TILE_SIZE
        )
          continue;
        sheet.draw(ctx, SLEEP_BUBBLE.sprite, x, y, { timeMs: timeMs + person.phase });
      }
    },
    draw(ctx, timeMs, view, tickAlpha = 1) {
      if (builtFor !== `${world.objects.nextId}/${world.objects.list.length}`) rebuild();
      ctx.imageSmoothingEnabled = false;
      const people = posesAt(tickAlpha);
      const things = itemsNear(view);
      patchShadows([...things.filter((thing) => thing.shadow), ...people]);
      // Villagers and items, by depth: a villager in front of an item on its own tile.
      type Figure =
        | { person: VillagerPose; depth: number; x: number }
        | { thing: ItemPose; depth: number; x: number };
      const figures: Figure[] = [
        ...people.map((person) => ({ person, depth: person.depth, x: person.x })),
        ...things.map((thing) => ({ thing, depth: thing.depth, x: thing.x })),
      ].sort((a, b) => a.depth - b.depth || a.x - b.x);
      const right = view.x + view.width;
      const bottom = view.y + view.height;

      for (const chunk of chunks) {
        if (chunk.x >= right || chunk.y >= bottom) continue;
        if (chunk.x + chunkPx <= view.x || chunk.y + chunkPx <= view.y) continue;
        ctx.drawImage(chunk.layer.canvasAt(timeMs), chunk.x - view.x, chunk.y - view.y);
      }

      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * sheet.shadowOpacity;
      ctx.drawImage(live, view.x, view.y, view.width, view.height, 0, 0, view.width, view.height);
      ctx.globalAlpha = alpha;

      const drawPerson = (person: VillagerPose) => {
        const entry = sheet.entry(person.sprite);
        const left = person.x - entry.anchor.x;
        const top = person.y - entry.anchor.y;
        if (left >= right || top >= bottom || left + entry.width <= view.x) return;
        if (top + entry.height <= view.y) return;
        sheet.draw(ctx, person.sprite, person.x - view.x, person.y - view.y, {
          animation: person.animation,
          swap: person.swap,
          ...(person.frame === null ? { timeMs: timeMs + person.phase } : { frame: person.frame }),
        });
        if (person.load) {
          sheet.draw(ctx, person.load.sprite, person.load.x - view.x, person.load.y - view.y, {
            swap: person.load.swap,
          });
        }
      };
      const drawThing = (thing: ItemPose) => {
        sheet.draw(ctx, thing.sprite, thing.x - view.x, thing.y - view.y, {
          ...(thing.animation === undefined ? {} : { animation: thing.animation }),
        });
      };
      const drawFigure = (figure: Figure) => {
        if ('person' in figure) drawPerson(figure.person);
        else drawThing(figure.thing);
      };

      let next = 0;
      for (const item of shown) {
        // Villagers and items standing behind this object are drawn before it.
        while (next < figures.length && figures[next]!.depth < item.placement.y) {
          drawFigure(figures[next]!);
          next++;
        }
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
      for (; next < figures.length; next++) drawFigure(figures[next]!);
    },
  };
}
