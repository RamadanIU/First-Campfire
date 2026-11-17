import { describe, expect, it } from 'vitest';
import { mapFromRows } from '../../tests/scenario.ts';
import { isWater } from './map.ts';
import {
  canStep,
  DIAGONAL,
  findNearest,
  findPath,
  type PathResult,
  type Tile,
  tileSpeed,
} from './path.ts';

function search(rows: string[], from: Tile, to: Tile, options = {}): PathResult {
  const { map, objects } = mapFromRows(rows);
  return findPath(map, objects, from, to, options);
}

function pathOf(result: PathResult): Tile[] {
  if (!result.ok) throw new Error(`пути нет: ${result.reason}`);
  return result.path;
}

const OPEN = ['........', '........', '........', '........', '........', '........'];

describe('поиск пути (A*)', () => {
  it('по открытой траве — прямо: 5 шагов, цена 5', () => {
    const result = search(OPEN, { x: 1, y: 2 }, { x: 6, y: 2 });
    expect(pathOf(result)).toEqual([2, 3, 4, 5, 6].map((x) => ({ x, y: 2 })));
    expect(result.ok && result.cost).toBe(5);
  });

  it('наискосок — диагональными шагами, каждый длиной √2', () => {
    const result = search(OPEN, { x: 0, y: 0 }, { x: 3, y: 3 });
    expect(pathOf(result)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    expect(result.ok && result.cost).toBeCloseTo(3 * DIAGONAL, 12);
  });

  it('уже на месте — пустой путь', () => {
    expect(search(OPEN, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual({
      ok: true,
      path: [],
      cost: 0,
      explored: 0,
    });
  });

  it('углы не срезает: мимо дерева и мимо края воды — только по сторонам тайлов', () => {
    const rows = ['.T..', '....', '~...', '....'];
    // (0,0) → (1,1): the diagonal would cut the tree's corner — two straight steps instead.
    expect(pathOf(search(rows, { x: 0, y: 0 }, { x: 1, y: 1 }))).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    // (0,1) → (1,2): the diagonal would cut the corner of the water.
    expect(pathOf(search(rows, { x: 0, y: 1 }, { x: 1, y: 2 }))).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]);
    // Every step of any path keeps to the rule.
    const { map, objects } = mapFromRows(rows);
    const path = pathOf(findPath(map, objects, { x: 0, y: 3 }, { x: 3, y: 0 }));
    let at = { x: 0, y: 3 };
    for (const tile of path) {
      expect(canStep(map, objects, at.x, at.y, tile.x - at.x, tile.y - at.y)).toBe(true);
      at = tile;
    }
  });

  it('вода и деревья непроходимы, цветы и высокая трава — проходимы', () => {
    const { map, objects } = mapFromRows(['.~=TBo*"', ',:......']);
    const speeds = [0, 1, 2, 3, 4, 5, 6, 7].map((x) => tileSpeed(map, objects, x, 0));
    expect(speeds).toEqual([1, 0, 0, 0, 0, 0, 1, 1]);
    expect(tileSpeed(map, objects, 0, 1)).toBe(0.8); // sand
    expect(tileSpeed(map, objects, 1, 1)).toBe(1.1); // dirt
    expect(tileSpeed(map, objects, -1, 0)).toBe(0); // outside the map
  });

  it('обходит стену и реку; путь идёт только по проходимым тайлам', () => {
    const rows = ['....~.....', '....~.....', '....=.....', '....~.....', '..........'];
    const { map, objects } = mapFromRows(rows);
    const result = findPath(map, objects, { x: 1, y: 0 }, { x: 8, y: 0 });
    const path = pathOf(result);
    expect(path.at(-1)).toEqual({ x: 8, y: 0 });
    for (const tile of path) expect(tileSpeed(map, objects, tile.x, tile.y)).toBeGreaterThan(0);
    // Down to row 4 (around the end of the water) and back up: much longer than straight.
    expect(Math.max(...path.map((tile) => tile.y))).toBe(4);
    expect(result.ok && result.cost).toBeGreaterThan(10);
  });

  it('цена зависит от земли: полоса песка дороже обхода по траве', () => {
    const rows = ['.......', ',,,,,,,', '.......'];
    const path = pathOf(search(rows, { x: 0, y: 1 }, { x: 6, y: 1 }));
    // Straight over sand would cost 6 / 0.8 = 7.5; up to the grass and back down — about 7.18.
    expect(path.slice(0, -1).every((tile) => tile.y !== 1)).toBe(true);
    // On equal ground it goes straight.
    expect(pathOf(search(OPEN, { x: 0, y: 1 }, { x: 6, y: 1 })).every((t) => t.y === 1)).toBe(true);
  });

  it('цель в воде или в дереве — сразу «заблокирована», ничего не осматривая', () => {
    expect(search(['...~', '...T'], { x: 0, y: 0 }, { x: 3, y: 0 })).toEqual({
      ok: false,
      reason: 'blocked',
      explored: 0,
    });
    expect(search(['...~', '...T'], { x: 0, y: 0 }, { x: 3, y: 1 })).toMatchObject({
      reason: 'blocked',
    });
  });

  it('недостижимая цель (остров) — «недостижима»; осмотрен только свой берег', () => {
    const rows = ['......~~~~', '......~..~', '......~..~', '......~~~~'];
    const result = search(rows, { x: 0, y: 0 }, { x: 7, y: 1 });
    expect(result).toEqual({ ok: false, reason: 'unreachable', explored: 24 });
  });

  it('объём поиска ограничен: дальняя цель при малом пределе — «слишком далеко»', () => {
    const rows = Array.from({ length: 40 }, () => '.'.repeat(40));
    const result = search(rows, { x: 0, y: 0 }, { x: 39, y: 39 }, { limit: 10 });
    expect(result).toEqual({ ok: false, reason: 'too_far', explored: 10 });
    expect(search(rows, { x: 0, y: 0 }, { x: 39, y: 39 }).ok).toBe(true);
  });

  it('обходит тайлы, занятые другими (avoid); занятая цель — заблокирована', () => {
    const avoid = (x: number, y: number) => x === 3 && y === 2;
    const path = pathOf(search(OPEN, { x: 1, y: 2 }, { x: 5, y: 2 }, { avoid }));
    expect(path).not.toContainEqual({ x: 3, y: 2 });
    expect(path.at(-1)).toEqual({ x: 5, y: 2 });
    expect(search(OPEN, { x: 1, y: 2 }, { x: 3, y: 2 }, { avoid })).toMatchObject({
      ok: false,
      reason: 'blocked',
    });
  });

  it('детерминирован: тот же запрос — тот же путь, и после поисков на других картах', () => {
    const rows = ['..T...T...', '....T.....', '.T....~~..', '...T..~...', '..........'];
    const first = search(rows, { x: 0, y: 0 }, { x: 9, y: 4 });
    search(OPEN, { x: 0, y: 0 }, { x: 7, y: 5 });
    search(['.~.', '.~.', '...'], { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(search(rows, { x: 0, y: 0 }, { x: 9, y: 4 })).toEqual(first);
  });
});

describe('ближайшее место (поиск по кольцам цены)', () => {
  /** A tile beside the water (on one of its four sides). */
  const byWater = (map: ReturnType<typeof mapFromRows>['map']) => (x: number, y: number) =>
    [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ].some(([dx, dy]) => isWater(map, x + dx!, y + dy!));

  it('находит ближайший по пути, а не по прямой: вода за деревьями дальше той, что в обход', () => {
    // Water at the top right is 2 tiles away in a straight line, but the trees wall it off; the
    // pond at the bottom is farther in a line, yet nearer by path.
    const rows = [
      '.....T~~',
      '.....T~~',
      '.....T..',
      '.....TTT',
      '........',
      '........',
      '.~~.....',
    ];
    const { map, objects } = mapFromRows(rows);
    const result = findNearest(map, objects, { x: 4, y: 1 }, byWater(map));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tile.y).toBeGreaterThanOrEqual(5);
    expect(byWater(map)(result.tile.x, result.tile.y)).toBe(true);
    // The path leads exactly there, step by step, and is the cheapest one to that tile.
    expect(result.path.at(-1)).toEqual(result.tile);
    const direct = findPath(map, objects, { x: 4, y: 1 }, result.tile);
    expect(direct.ok && direct.cost).toBeCloseTo(result.cost, 12);
  });

  it('стоит на месте — пустой путь; цели нет — «недостижимо», слишком далеко — «сдался»', () => {
    const { map, objects } = mapFromRows(OPEN);
    expect(findNearest(map, objects, { x: 2, y: 2 }, (x, y) => x === 2 && y === 2)).toMatchObject({
      ok: true,
      tile: { x: 2, y: 2 },
      path: [],
      cost: 0,
    });
    expect(findNearest(map, objects, { x: 2, y: 2 }, () => false)).toMatchObject({
      ok: false,
      reason: 'unreachable',
      explored: 48,
    });
    expect(
      findNearest(map, objects, { x: 0, y: 0 }, (x, y) => x === 7 && y === 5, { limit: 10 }),
    ).toMatchObject({ ok: false, reason: 'too_far' });
  });

  it('обходит занятые тайлы и не выбирает их', () => {
    const { map, objects } = mapFromRows(OPEN);
    const taken = (x: number, y: number) => x === 3 && y === 2;
    const result = findNearest(map, objects, { x: 1, y: 2 }, (x) => x === 3, { avoid: taken });
    expect(result.ok && result.tile).not.toEqual({ x: 3, y: 2 });
    expect(result.ok && result.tile.x).toBe(3);
  });

  it('одна карта — один ответ при равных расстояниях', () => {
    const { map, objects } = mapFromRows(OPEN);
    const corners = (x: number, y: number) => (x === 0 || x === 7) && (y === 0 || y === 5);
    const first = findNearest(map, objects, { x: 3, y: 2 }, corners);
    for (let i = 0; i < 5; i++) {
      expect(findNearest(map, objects, { x: 3, y: 2 }, corners)).toEqual(first);
    }
  });
});
