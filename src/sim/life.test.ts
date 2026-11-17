import { describe, expect, it } from 'vitest';
import { worldOn } from '../../tests/scenario.ts';
import { lifeSystem } from './life.ts';
import { fallPerTick } from './needs.ts';

describe('система жизни', () => {
  it('шкалы падают каждый тик; нужда на нуле — событие с причиной-нуждой, один раз', () => {
    const world = worldOn(['......', '......']);
    const [man, woman] = world.villagers.list;
    man!.needs.water = fallPerTick('water') / 2;
    world.tick = 10;
    lifeSystem.step(world);
    expect(woman!.needs.food).toBeCloseTo(100 - fallPerTick('food'), 12);
    const event = world.events.list.at(-1)!;
    expect(event).toMatchObject({
      type: 'need_ran_out',
      villager: man!.id,
      need: 'water',
      cause: { kind: 'need', villager: man!.id, need: 'water' },
    });
    expect(man!.ranOut.water).toBe(event.id);
    const count = world.events.list.length;
    lifeSystem.step(world);
    expect(world.events.list).toHaveLength(count);
    // Back above zero — the mark of running out is gone.
    man!.needs.water = 50;
    lifeSystem.step(world);
    expect(man!.ranOut.water).toBe(0);
  });

  it('здоровье на нуле — смерть: событие с причиной и признаками, житель уходит из мира', () => {
    const world = worldOn(['..B...', '......', '~~~~~~']);
    const [man] = world.villagers.list;
    man!.needs.food = 0;
    man!.needs.water = 0;
    lifeSystem.step(world); // both run out, thirst a moment later in the list order
    man!.health = 0.01;
    lifeSystem.step(world);
    expect(world.villagers.list.map((v) => v.id)).not.toContain(man!.id);
    const death = world.events.list.at(-1)!;
    expect(death).toMatchObject({
      type: 'villager_died',
      villager: man!.id,
      // Both at zero: the one that ran out first (food, earlier in the list of needs).
      reason: 'hunger',
      foodReachable: true,
      waterReachable: true,
    });
  });
});
