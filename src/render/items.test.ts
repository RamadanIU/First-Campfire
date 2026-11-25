import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../art/sprite.ts';
import type { Item } from '../sim/items.ts';
import type { Villager } from '../sim/villagers.ts';
import { itemPoses, LOAD, loadLook, PILE_STEPS, pileStep } from './items.ts';
import { villagerPose } from './villagers.ts';

const item = (fields: Partial<Item>): Item => ({
  id: 7,
  resource: 'branches',
  count: 10,
  x: 3,
  y: 4,
  place: 'pile',
  ...fields,
});

describe('как выглядят предметы (шаг 1.7)', () => {
  it('ступень кучи — по доле стопки: 1–3 из 10 — мало, 4–6 — средне, 7–10 — полная', () => {
    const steps = Array.from({ length: 10 }, (_, i) => PILE_STEPS[pileStep(i + 1, 10)]);
    expect(steps).toEqual([
      'small',
      'small',
      'small',
      'medium',
      'medium',
      'medium',
      'idle',
      'idle',
      'idle',
      'idle',
    ]);
  });

  it('ветки в куче — спрайт кучи нужной ступени на середине тайла, без сдвига', () => {
    const [pose, ...rest] = itemPoses(item({ count: 5 }));
    expect(rest).toEqual([]);
    expect(pose).toMatchObject({
      sprite: 'branch_pile',
      animation: 'medium',
      x: 3 * TILE_SIZE + TILE_SIZE / 2,
      y: 4 * TILE_SIZE + TILE_SIZE - 3,
    });
    expect(pose!.depth).toBe(pose!.y);
  });

  it('ветки на земле — свой значок, сдвинутый не больше чем на 2 пикселя', () => {
    const [pose] = itemPoses(item({ place: 'ground', count: 2 }));
    expect(pose!.sprite).toBe('branches');
    expect(Math.abs(pose!.x - (3 * TILE_SIZE + TILE_SIZE / 2))).toBeLessThanOrEqual(2);
    expect(Math.abs(pose!.y - (4 * TILE_SIZE + TILE_SIZE - 3))).toBeLessThanOrEqual(1);
  });

  it('ресурс без спрайта кучи — значки по одному на треть стопки', () => {
    expect(itemPoses(item({ resource: 'stones', count: 1 }))).toHaveLength(1);
    expect(itemPoses(item({ resource: 'stones', count: 4 }))).toHaveLength(3);
    for (const pose of itemPoses(item({ resource: 'stones', count: 4 }))) {
      expect(pose.sprite).toBe('stones');
    }
  });

  it('ноша: вязанка веток на линии плеч в цвет кожи; без особого вида — значок на голове', () => {
    expect(loadLook('branches')).toEqual({ sprite: 'carry_bundle', y: LOAD.shoulders, skin: true });
    expect(loadLook('stones')).toEqual({ sprite: 'stones', y: LOAD.head, skin: false });
  });

  it('житель с ношей: вязанка над ним, на шаге качается с телом; во сне ноши нет', () => {
    const villager = {
      id: 1,
      sex: 'male',
      skin: 2,
      hair: 0,
      x: 10,
      y: 20,
      toX: 11,
      toY: 20,
      progress: 0.5,
      prevX: 10.25,
      prevY: 20,
      facing: 'e',
      walked: 0,
      needs: { food: 100, water: 100, sleep: 100, warmth: 100 },
      action: {
        kind: 'walk',
        purpose: 'carry',
        goal: { x: 12, y: 20 },
        path: [],
        waited: 0,
        source: null,
      },
    } as unknown as Villager;
    const look = loadLook('branches');
    const stride = villagerPose(villager, 1, 0.5, look);
    expect(stride.frame).toBe(0);
    expect(stride.load).toEqual({
      sprite: 'carry_bundle',
      x: stride.x,
      y: stride.y + LOAD.shoulders + 1,
      swap: { skin_light: 'skin_tan' },
    });
    const passing = villagerPose({ ...villager, walked: 0.5 }, 1, 0.5, look);
    expect(passing.frame).toBe(1);
    expect(passing.load!.y).toBe(passing.y + LOAD.shoulders);
    expect(villagerPose(villager, 1, 0.5, null).load).toBeNull();
    const still = {
      ...villager,
      toX: 10,
      progress: 0,
      prevX: 10,
      action: { kind: 'sleep', fainted: false },
    };
    expect(villagerPose(still as Villager, 1, 0.5, look).load).toBeNull();
  });
});
