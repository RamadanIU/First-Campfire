import { describe, expect, it } from 'vitest';
import { emit } from '../sim/events.ts';
import { createWorld, runTicks, stepWorld } from '../sim/world.ts';
import { createFeed, FEED_SIZE } from './feed.ts';

describe('лента событий', () => {
  it('в новом мире — приход двоих, у каждой строки место; новые сверху', () => {
    const world = createWorld(1);
    const feed = createFeed();
    expect(feed.update(world)).toBe(true);
    expect(feed.entries.map((entry) => entry.text)).toEqual(['Пришла женщина', 'Пришёл мужчина']);
    for (const entry of feed.entries) {
      const villager = world.villagers.list.find((v) => v.id === entry.villager)!;
      expect(entry.place).toEqual({ x: villager.x, y: villager.y });
    }
  });

  it('ход времени (сутки, сезоны, светлячки) — не новость; каждое событие читается один раз', () => {
    const world = createWorld(1);
    const feed = createFeed();
    feed.update(world);
    const before = feed.entries;
    runTicks(world, 2000);
    expect(world.events.list.length).toBeGreaterThan(20);
    // The only news of these days: the fire lit on the first day (step 1.9).
    feed.update(world);
    expect(feed.entries.filter((e) => e.type !== 'fire_lit')).toEqual(before);
    expect(feed.entries.filter((e) => e.type === 'fire_lit')).toHaveLength(1);
    expect(feed.update(world)).toBe(false);
  });

  it('костёр (шаг 1.9): «Мужчина развёл первый костёр», «Костёр погас — прогорели дрова» — с местом', () => {
    const world = createWorld(1);
    const feed = createFeed();
    const { camp } = world;
    emit(
      world,
      { type: 'fire_lit', villager: 1, sex: 'male', x: camp.x, y: camp.y, first: true },
      { kind: 'decision', villager: 1, activity: 'kindle' },
    );
    emit(
      world,
      { type: 'fire_out', x: camp.x, y: camp.y, lit: 3, burned: 7 },
      { kind: 'rule', rule: 'fuel' },
    );
    emit(
      world,
      { type: 'fire_lit', villager: 2, sex: 'female', x: camp.x, y: camp.y, first: false },
      { kind: 'decision', villager: 2, activity: 'kindle' },
    );
    feed.update(world);
    expect(feed.entries.slice(0, 3).map((e) => [e.text, e.place])).toEqual([
      ['Женщина развела костёр', { x: camp.x, y: camp.y }],
      ['Костёр погас — прогорели дрова', { x: camp.x, y: camp.y }],
      ['Мужчина развёл первый костёр', { x: camp.x, y: camp.y }],
    ]);
  });

  it('голод, обморок и смерть — с причиной и местом; пол берётся из прихода', () => {
    const world = createWorld(1);
    const feed = createFeed();
    feed.update(world);
    const [man, woman] = world.villagers.list;
    const ran = emit(
      world,
      { type: 'need_ran_out', villager: woman!.id, need: 'food' },
      { kind: 'need', villager: woman!.id, need: 'food' },
    );
    emit(
      world,
      { type: 'villager_fainted', villager: man!.id, sex: 'male', x: 3, y: 4 },
      { kind: 'rule', rule: 'calendar' },
    );
    emit(
      world,
      {
        type: 'villager_died',
        villager: woman!.id,
        sex: 'female',
        x: 10,
        y: 12,
        reason: 'hunger',
        foodReachable: false,
        waterReachable: true,
        warmReachable: true,
      },
      { kind: 'event', event: ran.id },
    );
    expect(feed.update(world)).toBe(true);
    expect(feed.entries.slice(0, 3)).toMatchObject([
      { text: 'Умерла женщина — голод', place: { x: 10, y: 12 }, type: 'villager_died' },
      { text: 'Мужчина упал без сил — не спал', place: { x: 3, y: 4 } },
      { text: 'Женщина голодает', place: null, villager: woman!.id },
    ]);
  });

  it(`помнит не больше ${FEED_SIZE} последних строк`, () => {
    const world = createWorld(1);
    const feed = createFeed();
    for (let i = 0; i < 8; i++) {
      emit(
        world,
        { type: 'villager_fainted', villager: 1, sex: 'male', x: i, y: 0 },
        { kind: 'rule', rule: 'calendar' },
      );
      if (i % 3 === 0) feed.update(world);
    }
    feed.update(world);
    expect(feed.entries).toHaveLength(FEED_SIZE);
    expect(feed.entries.map((entry) => entry.place?.x)).toEqual([7, 6, 5, 4, 3]);
  });

  it('мир, где оба умерли (зерно 92): последние строки — смерти от голода', () => {
    // A barren world (step 1.11: bushes bear every year — here every crop is taken as it ripens):
    // both starve by day 70 (tick 28 000).
    const world = createWorld(92);
    for (let tick = 0; tick < 28_000; tick++) {
      for (const object of world.objects.list) object.stock = 0;
      stepWorld(world);
    }
    const feed = createFeed();
    feed.update(world);
    const deaths = feed.entries.filter((entry) => entry.type === 'villager_died');
    expect(deaths).toHaveLength(2);
    expect(deaths.every((entry) => entry.text.endsWith('голод'))).toBe(true);
  });
});
