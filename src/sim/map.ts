/**
 * The map: a grid of tiles in layers (GDD §2.2). So far two layers — the ground (grass, sand,
 * water…) and the object standing on the tile (a tree, a bush, a boulder…).
 *
 * Every layer is a typed array over the whole map, row by row: tile (x, y) is at index
 * `y * width + x`. Typed arrays are plain data for the world: the hash and saves handle them
 * (./hash.ts, ./save.ts — base64 in the save). The map is cut into square chunks
 * (`chunkSize`, 32×32 by GDD §2.2): the renderer caches pictures per chunk, later steps will
 * track changes per chunk; the layers themselves stay whole-map arrays (simple and fast).
 *
 * - `ground` holds the index of the type of ground in `groundTypes` — a copy of the ids of
 *   data/terrain.json taken when the map was made, so a save does not depend on the order of the
 *   table.
 * - `object` holds the id of the object on the tile (0 — none); the objects themselves, with their
 *   state, live in `world.objects` (./objects.ts).
 * - `fields` — the hidden numbers of a tile (GDD §2.2: fertility, moisture, wear of paths…): a
 *   typed array per field, added by the step that first needs it. Empty so far.
 */
import { DATA } from '../data/index.ts';
import type { Terrain } from '../data/tables.ts';

/** Hidden fields of a tile (GDD §2.2). Each is a Uint8Array over the map once a step fills it. */
export type TileField =
  | 'fertility'
  | 'moisture'
  | 'temperature'
  | 'wear'
  | 'pollution'
  | 'appeal'
  | 'plot';

export interface WorldMap {
  /** Size in tiles. */
  width: number;
  height: number;
  /** Side of a chunk in tiles; width and height are multiples of it. */
  chunkSize: number;
  /** Ids of the types of ground (data/terrain.json); `ground` holds indices into this list. */
  groundTypes: string[];
  /** Ground layer: index into `groundTypes` per tile. */
  ground: Uint8Array;
  /** Object layer: id of the object standing on the tile, 0 — none. */
  object: Uint32Array;
  /** Hidden fields of tiles, filled by later steps (GDD §2.2). */
  fields: Partial<Record<TileField, Uint8Array>>;
}

/** An empty map of the given size: everything is the first type of ground, no objects. */
export function createMap(width: number, height: number, chunkSize: number): WorldMap {
  if (width % chunkSize !== 0 || height % chunkSize !== 0) {
    throw new Error(`Карта ${width}×${height} не делится на чанки ${chunkSize}×${chunkSize}`);
  }
  return {
    width,
    height,
    chunkSize,
    groundTypes: DATA.terrain.records.map((terrain) => terrain.id),
    ground: new Uint8Array(width * height),
    object: new Uint32Array(width * height),
    fields: {},
  };
}

export function inside(map: WorldMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

/** Index of tile (x, y) in the layers. The tile must be inside the map. */
export function tileIndex(map: WorldMap, x: number, y: number): number {
  return y * map.width + x;
}

/** Index of a type of ground in `groundTypes`; throws on an unknown id (a bug in the code). */
export function groundCode(map: WorldMap, id: string): number {
  const code = map.groundTypes.indexOf(id);
  if (code < 0) throw new Error(`На карте нет типа земли «${id}»: ${map.groundTypes.join(', ')}`);
  return code;
}

/** Id of the ground at (x, y); outside the map — the nearest edge tile (the land goes on). */
export function groundAt(map: WorldMap, x: number, y: number): string {
  const cx = x < 0 ? 0 : x >= map.width ? map.width - 1 : x;
  const cy = y < 0 ? 0 : y >= map.height ? map.height - 1 : y;
  return map.groundTypes[map.ground[cy * map.width + cx]!]!;
}

export function setGround(map: WorldMap, x: number, y: number, id: string): void {
  map.ground[tileIndex(map, x, y)] = groundCode(map, id);
}

/** The type of ground at (x, y) from data/terrain.json. */
export function terrainAt(map: WorldMap, x: number, y: number): Terrain {
  return DATA.terrain.get(groundAt(map, x, y));
}

/** Water (or any ground one cannot walk on)? */
export function isWater(map: WorldMap, x: number, y: number): boolean {
  return !terrainAt(map, x, y).walkable;
}

/** Number of chunks along x and y. */
export function chunkGrid(map: WorldMap): { cols: number; rows: number } {
  return { cols: map.width / map.chunkSize, rows: map.height / map.chunkSize };
}

/** Tiles of chunk (cx, cy): its top-left tile and size. */
export function chunkRect(
  map: WorldMap,
  cx: number,
  cy: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: cx * map.chunkSize,
    y: cy * map.chunkSize,
    width: map.chunkSize,
    height: map.chunkSize,
  };
}

/** How many tiles of each type of ground the map has, by id. */
export function groundCounts(map: WorldMap): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of map.groundTypes) counts[id] = 0;
  for (const code of map.ground) counts[map.groundTypes[code]!]! += 1;
  return counts;
}
