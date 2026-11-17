import { describe, expect, it } from 'vitest';
import { createMap, setGround, tileIndex } from './map.ts';
import {
  createObjects,
  defOf,
  findObject,
  isPassable,
  objectAt,
  placeObject,
  removeObject,
  takeFood,
} from './objects.ts';

function emptyMap() {
  const map = createMap(32, 32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) setGround(map, x, y, 'grass');
  return { map, objects: createObjects() };
}

describe('объекты карты', () => {
  it('новый объект — следующий id, начальное состояние вида, отметка на тайле', () => {
    const { map, objects } = emptyMap();
    const bush = placeObject(map, objects, 'berry_bush', 3, 4);
    const oak = placeObject(map, objects, 'oak', 10, 2);
    expect(bush).toEqual({ id: 1, def: 'berry_bush', x: 3, y: 4, state: 'ripe', stock: 4 });
    expect(oak.id).toBe(2);
    expect(oak.stock).toBe(0);
    expect(objects.nextId).toBe(3);
    expect(map.object[tileIndex(map, 3, 4)]).toBe(1);
    expect(objectAt(map, objects, 10, 2)).toBe(oak);
    expect(objectAt(map, objects, 5, 5)).toBeUndefined();
    expect(objectAt(map, objects, -1, 5)).toBeUndefined();
    expect(defOf(bush).name).toBe('Малина');
  });

  it('еду с куста берут, пока она есть; обобранный куст пустеет', () => {
    const { map, objects } = emptyMap();
    const bush = placeObject(map, objects, 'berry_bush', 3, 4);
    expect(takeFood(bush, 1.5)).toBe(1.5);
    expect(bush).toMatchObject({ stock: 2.5, state: 'ripe' });
    expect(takeFood(bush, 2)).toBe(2);
    // Less is left than asked: only what is there; the bush is empty now.
    expect(takeFood(bush, 1)).toBe(0.5);
    expect(bush).toMatchObject({ stock: 0, state: 'empty' });
    expect(takeFood(bush, 1)).toBe(0);
    // Nothing on a tree, and it keeps its state.
    const oak = placeObject(map, objects, 'oak', 10, 2);
    expect(takeFood(oak, 1)).toBe(0);
    expect(oak.state).toBe('grown');
  });

  it('на тайле не больше одного объекта; за край карты ставить нельзя', () => {
    const { map, objects } = emptyMap();
    placeObject(map, objects, 'oak', 1, 1);
    expect(() => placeObject(map, objects, 'boulder', 1, 1)).toThrow('уже занят');
    expect(() => placeObject(map, objects, 'boulder', 32, 0)).toThrow('за краем карты');
  });

  it('удаление освобождает тайл; поиск по id — и после удаления', () => {
    const { map, objects } = emptyMap();
    for (let i = 0; i < 20; i++) placeObject(map, objects, 'flowers', i, 0);
    removeObject(map, objects, 7);
    removeObject(map, objects, 8);
    expect(map.object[tileIndex(map, 6, 0)]).toBe(0);
    expect(findObject(objects, 7)).toBeUndefined();
    for (const id of [1, 6, 9, 13, 20]) expect(findObject(objects, id)?.id).toBe(id);
    expect(findObject(objects, 21)).toBeUndefined();
    expect(() => removeObject(map, objects, 7)).toThrow('Нет объекта #7');
    // A new object after removals still gets a fresh id: the list stays in the order of ids.
    expect(placeObject(map, objects, 'oak', 6, 0).id).toBe(21);
  });

  it('проходимость: вода и деревья — нет, цветы и трава — да', () => {
    const { map, objects } = emptyMap();
    setGround(map, 0, 0, 'shallow_water');
    placeObject(map, objects, 'oak', 1, 0);
    placeObject(map, objects, 'flowers', 2, 0);
    placeObject(map, objects, 'berry_bush', 3, 0);
    expect([0, 1, 2, 3, 4].map((x) => isPassable(map, objects, x, 0))).toEqual([
      false,
      false,
      true,
      false,
      true,
    ]);
    expect(isPassable(map, objects, -1, 0)).toBe(false);
  });
});
