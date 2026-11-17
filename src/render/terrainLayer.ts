/**
 * The ground of a rectangle of the map as one picture: every tile composed with its transitions
 * (src/art/terrain.ts) and put on a canvas. The ground has only a few distinct states — one
 * per frame of the water ripple — so each state is composed once, on first use, and cached.
 * Drawing the ground is then a single drawImage per frame.
 *
 * A big map is cut into chunks (step 1.1, ./mapRenderer.ts): each chunk is such a layer over
 * its own rectangle (`origin` — its top-left tile; tiles keep their map coordinates, so chunks
 * meet without seams). Two savings make chunks cheap:
 *   - a layer with no animated ground near it (no water) has one state, not four;
 *   - after the first state, only tiles next to animated ground are composed again — the rest
 *     are copied from the first state.
 */

import { TILE_SIZE } from '../art/sprite.ts';
import {
  composeTerrainTile,
  isAnimatedLook,
  type TerrainArt,
  type TerrainAt,
  terrainStateKey,
  terrainStateTimes,
} from '../art/terrain.ts';

export interface TerrainLayer {
  /** Size in tiles. */
  readonly width: number;
  readonly height: number;
  /** Does any ground of the layer move (water)? Without it the layer has a single state. */
  readonly animated: boolean;
  /** Ground states composed so far. */
  readonly cachedStates: number;
  /** Which state of the ground shows at `timeMs` (one key per distinct picture). */
  stateAt(timeMs: number): string;
  /** The whole ground at presentation time `timeMs`, one canvas pixel per world pixel. */
  canvasAt(timeMs: number): HTMLCanvasElement;
  /** Compose every state now (at scene start), so the animation never stutters later. */
  composeAll(): void;
}

export function createTerrainLayer(
  art: TerrainArt,
  at: TerrainAt,
  width: number,
  height: number,
  origin: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): TerrainLayer {
  const cache = new Map<string, HTMLCanvasElement>();

  // A tile changes with the ripple if animated ground lies on it or next to it (its edge spills
  // in): mark such tiles once.
  const moving = new Uint8Array(width * height);
  let animated = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let dy = -1; dy <= 1 && moving[y * width + x] === 0; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (isAnimatedLook(art, at(origin.x + x + dx, origin.y + y + dy))) {
            moving[y * width + x] = 1;
            animated = true;
            break;
          }
        }
      }
    }
  }

  /** Pixels of the first composed state: still tiles of later states are copied from it. */
  let first: Uint8ClampedArray | null = null;

  function compose(timeMs: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width * TILE_SIZE;
    canvas.height = height * TILE_SIZE;
    const pixels = first
      ? new Uint8ClampedArray(first)
      : new Uint8ClampedArray(canvas.width * canvas.height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (first && moving[y * width + x] === 0) continue;
        const tile = composeTerrainTile(art, at, origin.x + x, origin.y + y, timeMs).pixels;
        for (let row = 0; row < TILE_SIZE; row++) {
          pixels.set(
            tile.subarray(row * TILE_SIZE * 4, (row + 1) * TILE_SIZE * 4),
            ((y * TILE_SIZE + row) * canvas.width + x * TILE_SIZE) * 4,
          );
        }
      }
    }
    first ??= pixels;
    canvas.getContext('2d')!.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
    return canvas;
  }

  return {
    width,
    height,
    animated,
    get cachedStates() {
      return cache.size;
    },
    stateAt(timeMs) {
      return animated ? terrainStateKey(art, timeMs) : '';
    },
    canvasAt(timeMs) {
      const key = this.stateAt(timeMs);
      let canvas = cache.get(key);
      if (!canvas) {
        canvas = compose(timeMs);
        cache.set(key, canvas);
      }
      return canvas;
    },
    composeAll() {
      for (const timeMs of animated ? terrainStateTimes(art) : [0]) this.canvasAt(timeMs);
    },
  };
}
