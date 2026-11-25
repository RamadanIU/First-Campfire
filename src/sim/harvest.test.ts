import { describe, expect, it } from 'vitest';
import { DATA } from '../data/index.ts';
import { tickAt } from './calendar.ts';
import { ripenDay, setCrops, untouchedCrop } from './harvest.ts';
import { createMap, setGround } from './map.ts';
import { createObjects, placeObject, takeFood } from './objects.ts';

function bushAndHazel() {
  const map = createMap(8, 8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) setGround(map, x, y, 'grass');
  const objects = createObjects();
  const bush = placeObject(map, objects, 'berry_bush', 1, 1);
  const hazel = placeObject(map, objects, 'hazel', 4, 1);
  const oak = placeObject(map, objects, 'oak', 6, 6);
  return { bush, hazel, oak };
}

const BERRIES = DATA.objects.get('berry_bush').harvest!;
const NUTS = DATA.objects.get('hazel').harvest!;
const DAYS = DATA.balance.time.daysPerSeason;
const YEAR_DAYS = DAYS * 4;

/** The start of every day from `from` to `to` (days of the world, from 1), as the system sees them. */
function days(from: number, to: number, each: (tick: number) => void): void {
  for (let day = from; day <= to; day++) each(tickAt(day, 0));
}

describe('урожай раз в год (шаг 1.11)', () => {
  it('малина наливается весной долями по дням; летом и осенью ягоды держатся; зимой осыпаются', () => {
    const { bush, oak } = bushAndHazel();
    bush.stock = 0;
    const seen: number[] = [];
    days(1, YEAR_DAYS, (tick) => {
      ripenDay(bush, tick);
      ripenDay(oak, tick);
      seen.push(bush.stock);
    });
    const share = BERRIES.rations / DAYS;
    expect(seen.slice(0, DAYS)).toEqual([share, 2 * share, 3 * share]);
    expect(seen[DAYS - 1]).toBeCloseTo(BERRIES.rations, 12);
    // Summer and autumn: the year's crop waits on the bush.
    for (const stock of seen.slice(DAYS, 3 * DAYS)) expect(stock).toBeCloseTo(BERRIES.rations, 12);
    // Winter: fallen, the bush is bare.
    expect(seen.slice(3 * DAYS)).toEqual([0, 0, 0]);
    expect(bush.state).toBe(BERRIES.empty);
    // A tree has no crop.
    expect(oak).toMatchObject({ stock: 0, state: 'grown' });
  });

  it('обобранный куст пуст до следующего урожая, а к следующему году восстанавливается', () => {
    const { bush } = bushAndHazel();
    bush.stock = 0;
    days(1, DAYS, (tick) => ripenDay(bush, tick));
    // Picked clean at the end of spring.
    takeFood(bush, BERRIES.rations);
    expect(bush).toMatchObject({ stock: 0, state: BERRIES.empty });
    // Summer, autumn, winter: nothing comes back (eaten berries are gone, the shares do not top up).
    days(DAYS + 1, YEAR_DAYS, (tick) => {
      ripenDay(bush, tick);
      expect(bush.stock).toBe(0);
    });
    // The next spring: the crop again, little by little, all of it by the end of spring.
    days(YEAR_DAYS + 1, YEAR_DAYS + DAYS, (tick) => ripenDay(bush, tick));
    expect(bush.stock).toBeCloseTo(BERRIES.rations, 12);
    expect(bush.state).toBe('ripe');
  });

  it('куст не копит урожай за годы: остаток прошлого года осыпается до нового', () => {
    const { bush } = bushAndHazel();
    bush.stock = 0;
    for (let year = 0; year < 3; year++) {
      days(year * YEAR_DAYS + 1, (year + 1) * YEAR_DAYS, (tick) => ripenDay(bush, tick));
    }
    expect(bush.stock).toBe(0);
    days(3 * YEAR_DAYS + 1, 3 * YEAR_DAYS + DAYS, (tick) => ripenDay(bush, tick));
    expect(bush.stock).toBeCloseTo(BERRIES.rations, 12);
  });

  it('лещина зреет осенью, орехи держатся зимой, весной их нет', () => {
    const { hazel } = bushAndHazel();
    hazel.stock = 0;
    const seen: number[] = [];
    days(1, YEAR_DAYS + 1, (tick) => {
      ripenDay(hazel, tick);
      seen.push(hazel.stock);
    });
    expect(seen.slice(0, 2 * DAYS)).toEqual(Array(2 * DAYS).fill(0));
    expect(seen[2 * DAYS]).toBeCloseTo(NUTS.rations / DAYS, 12);
    expect(seen[3 * DAYS - 1]).toBeCloseTo(NUTS.rations, 12);
    expect(seen[4 * DAYS - 1]).toBeCloseTo(NUTS.rations, 12);
    expect(seen[YEAR_DAYS]).toBe(0);
    expect(hazel.state).toBe(NUTS.empty);
  });

  it('нетронутый урожай по календарю; новый мир — первая доля малины, лещина пуста', () => {
    expect(untouchedCrop(BERRIES, 0)).toBeCloseTo(BERRIES.rations / DAYS, 12);
    expect(untouchedCrop(BERRIES, tickAt(2, 200))).toBeCloseTo((2 * BERRIES.rations) / DAYS, 12);
    expect(untouchedCrop(BERRIES, tickAt(5, 0))).toBe(BERRIES.rations);
    expect(untouchedCrop(BERRIES, tickAt(11, 0))).toBe(0);
    expect(untouchedCrop(NUTS, tickAt(2, 0))).toBe(0);
    expect(untouchedCrop(NUTS, tickAt(11, 0))).toBe(NUTS.rations);
    const { bush, hazel, oak } = bushAndHazel();
    const world = { tick: 0, objects: { list: [bush, hazel, oak], nextId: 4 } };
    setCrops(world as Parameters<typeof setCrops>[0]);
    expect(bush).toMatchObject({ stock: BERRIES.rations / DAYS, state: 'ripe' });
    expect(hazel).toMatchObject({ stock: 0, state: NUTS.empty });
    expect(oak.stock).toBe(0);
  });
});
