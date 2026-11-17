/**
 * The ground of a map as one picture: every tile composed with its transitions
 * (src/art/terrain.ts) and put on a canvas. The ground has only a few distinct states — one
 * per frame of the water ripple — so each state is composed once, on first use, and cached.
 * Drawing the ground is then a single drawImage per frame.
 *
 * Stage 1.1 cuts big maps into chunks; the composing stays the same.
 */

import { TILE_SIZE } from '../art/sprite.ts';
import {
  composeTerrainTile,
  type TerrainArt,
  type TerrainAt,
  terrainStateKey,
  terrainStateTimes,
} from '../art/terrain.ts';

export interface TerrainLayer {
  /** Size in tiles. */
  readonly width: number;
  readonly height: number;
  /** Ground states composed so far. */
  readonly cachedStates: number;
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
): TerrainLayer {
  const cache = new Map<string, HTMLCanvasElement>();

  function compose(timeMs: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width * TILE_SIZE;
    canvas.height = height * TILE_SIZE;
    const pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = composeTerrainTile(art, at, x, y, timeMs).pixels;
        for (let row = 0; row < TILE_SIZE; row++) {
          pixels.set(
            tile.subarray(row * TILE_SIZE * 4, (row + 1) * TILE_SIZE * 4),
            ((y * TILE_SIZE + row) * canvas.width + x * TILE_SIZE) * 4,
          );
        }
      }
    }
    canvas.getContext('2d')!.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
    return canvas;
  }

  return {
    width,
    height,
    get cachedStates() {
      return cache.size;
    },
    canvasAt(timeMs) {
      const key = terrainStateKey(art, timeMs);
      let canvas = cache.get(key);
      if (!canvas) {
        canvas = compose(timeMs);
        cache.set(key, canvas);
      }
      return canvas;
    },
    composeAll() {
      for (const timeMs of terrainStateTimes(art)) this.canvasAt(timeMs);
    },
  };
}
