import { describe, expect, it } from 'vitest';
import { meadow, worldOn } from '../../tests/scenario.ts';
import {
  countAll,
  dropLoad,
  isPileTile,
  itemAt,
  lay,
  pileSpot,
  pileTiles,
  roomAt,
  stackOf,
  takeItem,
} from './items.ts';

/** A meadow world with nothing lying about (no trees, nothing falls). */
function field() {
  const world = worldOn(meadow(16, 12));
  return { world, man: world.villagers.list[0]! };
}

describe('предметы: положить, взять, уронить (шаг 1.7)', () => {
  it('на тайле — одна стопка одного ресурса, не больше стопки', () => {
    const { world } = field();
    expect(lay(world, 'branches', 7, 2, 2)).toBe(7);
    expect(lay(world, 'branches', 7, 2, 2)).toBe(3);
    expect(itemAt(world, 2, 2)!.count).toBe(stackOf('branches'));
    expect(lay(world, 'stones', 1, 2, 2)).toBe(0);
    expect(roomAt(world, 2, 2, 'branches')).toBe(0);
    expect(world.items.list).toHaveLength(1);
  });

  it('взять: вся стопка уходит в руки с тем же id, часть — новой стопкой; чужой ресурс — нет', () => {
    const { world, man } = field();
    lay(world, 'branches', 4, 2, 2);
    lay(world, 'branches', 9, 3, 2);
    lay(world, 'stones', 2, 4, 2);
    const first = itemAt(world, 2, 2)!;
    expect(takeItem(world, man, first, first.count)).toBe(4);
    expect(man.load).toEqual({ id: first.id, resource: 'branches', count: 4, spoils: 0 });
    expect(itemAt(world, 2, 2)).toBeUndefined();
    // The hands hold one stack: 6 more of the 9, 3 stay.
    expect(takeItem(world, man, itemAt(world, 3, 2)!, 9)).toBe(6);
    expect(man.load!.count).toBe(10);
    expect(itemAt(world, 3, 2)!.count).toBe(3);
    expect(takeItem(world, man, itemAt(world, 4, 2)!, 2)).toBe(0);
    expect(countAll(world)).toEqual({ branches: 13, stones: 2 });
  });

  it('уронить ношу: на свой тайл, а что не влезло — на ближние; ничего не теряется', () => {
    const { world, man } = field();
    lay(world, 'branches', 8, man.x, man.y);
    man.load = { id: 99, resource: 'branches', count: 10, spoils: 0 };
    const before = countAll(world).branches;
    dropLoad(world, man);
    expect(man.load).toBeNull();
    expect(itemAt(world, man.x, man.y)!.count).toBe(10);
    expect(world.items.list.find((item) => item.id === 99)!.count).toBe(8);
    expect(countAll(world).branches).toBe(before);
  });

  it('куча: тайлы вокруг места кучи, не середина стоянки; начатая стопка — первой', () => {
    const { world } = field();
    const tiles = pileTiles(world);
    expect(tiles[0]).toEqual(world.camp.pile);
    expect(tiles).toHaveLength(9);
    for (const tile of tiles) expect(isPileTile(world, tile.x, tile.y)).toBe(true);
    expect(isPileTile(world, world.camp.x, world.camp.y)).toBe(false);
    expect(pileSpot(world, 'branches')).toEqual(tiles[0]);
    lay(world, 'branches', 10, tiles[0]!.x, tiles[0]!.y);
    lay(world, 'branches', 3, tiles[2]!.x, tiles[2]!.y);
    expect(itemAt(world, tiles[2]!.x, tiles[2]!.y)!.place).toBe('pile');
    expect(pileSpot(world, 'branches')).toEqual(tiles[2]);
    // Busy (another walks there): the next empty one.
    expect(pileSpot(world, 'branches', (x, y) => x === tiles[2]!.x && y === tiles[2]!.y)).toEqual(
      tiles[1],
    );
    for (const tile of tiles) lay(world, 'branches', 10, tile.x, tile.y);
    expect(pileSpot(world, 'branches')).toBeNull();
  });
});
