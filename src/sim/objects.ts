/**
 * Objects of the map: trees, bushes, boulders, flowers… (GDD §2.2, the object layer). Each is an
 * entity with an id, a kind (`def` — a record of data/objects.json), a tile and a state.
 *
 * The list is kept in the order of ids (new objects get the next id and go to the end), so an
 * object is found by its id with a binary search. The tile → object index is the map's `object`
 * layer (./map.ts): placing and removing go through this module, which keeps both in step.
 * At most one object stands on a tile.
 */
import { DATA } from '../data/index.ts';
import type { MapObjectDef } from '../data/tables.ts';
import { inside, tileIndex, type WorldMap } from './map.ts';

export interface MapObject {
  id: number;
  /** Kind of the object: id of a record of data/objects.json. */
  def: string;
  /** Tile. */
  x: number;
  y: number;
  /** One of the def's `states`; the first one when the object appears. */
  state: string;
}

export interface MapObjects {
  /** Every object of the map, in the order of ids. */
  list: MapObject[];
  nextId: number;
}

export function createObjects(): MapObjects {
  return { list: [], nextId: 1 };
}

/** The record of data/objects.json for an object. */
export function defOf(object: MapObject): MapObjectDef {
  return DATA.objects.get(object.def);
}

/**
 * Put a new object of kind `def` on tile (x, y) in its first state. The tile must be inside the
 * map and free — a bug in the code otherwise.
 */
export function placeObject(
  map: WorldMap,
  objects: MapObjects,
  def: string,
  x: number,
  y: number,
): MapObject {
  if (!inside(map, x, y)) throw new Error(`Объект «${def}» за краем карты: (${x}, ${y})`);
  const at = tileIndex(map, x, y);
  if (map.object[at] !== 0) {
    throw new Error(`Тайл (${x}, ${y}) уже занят объектом #${map.object[at]}`);
  }
  const object: MapObject = {
    id: objects.nextId,
    def,
    x,
    y,
    state: DATA.objects.get(def).states[0]!,
  };
  objects.nextId += 1;
  objects.list.push(object);
  map.object[at] = object.id;
  return object;
}

/** Remove an object from the map and the list. */
export function removeObject(map: WorldMap, objects: MapObjects, id: number): void {
  const index = indexOf(objects, id);
  if (index < 0) throw new Error(`Нет объекта #${id}`);
  const object = objects.list[index]!;
  objects.list.splice(index, 1);
  map.object[tileIndex(map, object.x, object.y)] = 0;
}

function indexOf(objects: MapObjects, id: number): number {
  const list = objects.list;
  let low = 0;
  let high = list.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const found = list[middle]!.id;
    if (found === id) return middle;
    if (found < id) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

export function findObject(objects: MapObjects, id: number): MapObject | undefined {
  const index = indexOf(objects, id);
  return index < 0 ? undefined : objects.list[index];
}

/** The object standing on tile (x, y), if any (outside the map — none). */
export function objectAt(
  map: WorldMap,
  objects: MapObjects,
  x: number,
  y: number,
): MapObject | undefined {
  if (!inside(map, x, y)) return undefined;
  const id = map.object[tileIndex(map, x, y)]!;
  return id === 0 ? undefined : findObject(objects, id);
}

/** Can one walk through tile (x, y): walkable ground and no object that blocks the way. */
export function isPassable(map: WorldMap, objects: MapObjects, x: number, y: number): boolean {
  if (!inside(map, x, y)) return false;
  const terrain = DATA.terrain.get(map.groundTypes[map.ground[tileIndex(map, x, y)]!]!);
  if (!terrain.walkable) return false;
  const object = objectAt(map, objects, x, y);
  return object === undefined || defOf(object).walkable;
}
