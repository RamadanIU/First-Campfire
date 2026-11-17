import { describe, expect, it } from 'vitest';
import { drawOrder, type Placement } from './scenery.ts';

describe('порядок рисования', () => {
  it('сначала дальнее (меньше y), потом ближнее; при равной глубине — слева направо, затем по списку', () => {
    const items: Placement[] = [
      { sprite: 'tree', x: 10, y: 50 },
      { sprite: 'man', x: 30, y: 40 },
      { sprite: 'bush', x: 5, y: 50 },
      { sprite: 'stone', x: 5, y: 50 },
      { sprite: 'fire', x: 0, y: 60 },
    ];
    expect(drawOrder(items).map((i) => items[i]!.sprite)).toEqual([
      'man',
      'bush',
      'stone',
      'tree',
      'fire',
    ]);
  });

  it('пузырьки — поверх всего, даже того, что ближе', () => {
    const items: Placement[] = [
      { sprite: 'bubble_food', x: 0, y: 10, over: true },
      { sprite: 'man', x: 0, y: 30 },
      { sprite: 'tree', x: 0, y: 90 },
    ];
    expect(drawOrder(items).map((i) => items[i]!.sprite)).toEqual(['man', 'tree', 'bubble_food']);
  });
});
