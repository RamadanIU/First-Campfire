import { describe, expect, it } from 'vitest';
import { worldOn } from '../../tests/scenario.ts';
import { seasonalState } from './mapRenderer.ts';
import { layerOffset, rainPixels, snowPixels, WEATHER_TILE, weatherTint } from './weather.ts';

describe('погода на карте (шаг 1.10)', () => {
  it('под тучами свет тусклее, в дождь — темнее и синее, ясно — как есть', () => {
    const day = [1, 1, 1] as const;
    expect(weatherTint(day, 'clear')).toEqual([1, 1, 1]);
    const cloudy = weatherTint(day, 'cloudy');
    const rain = weatherTint(day, 'rain');
    expect(cloudy[0]).toBeLessThan(1);
    expect(rain[0]).toBeLessThan(cloudy[0]);
    expect(rain[2]).toBeGreaterThan(rain[0]);
  });

  it('капли и снежинки — плитка-узор: внутри плитки, повторяется без шва; сдвиг — по времени показа, целыми пикселями', () => {
    for (const pixels of [rainPixels(), snowPixels(false), snowPixels(true)]) {
      expect(pixels.length).toBeGreaterThan(20);
      for (const { x, y } of pixels) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(WEATHER_TILE);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(WEATHER_TILE);
      }
    }
    // The same pattern every time (no randomness of the moment).
    expect(rainPixels()).toEqual(rainPixels());
    const a = layerOffset(1500, 220, 0.35);
    expect(layerOffset(1500, 220, 0.35)).toEqual(a);
    expect(Number.isInteger(a.x) && Number.isInteger(a.y)).toBe(true);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeLessThan(WEATHER_TILE);
    // Rain falls: later — further down (modulo the tile).
    expect(layerOffset(1600, 220, 0.35).y).toBe((a.y + 22) % WEATHER_TILE);
  });
});

describe('сезон на карте', () => {
  it('малина зимой нарисована пустой (ягоды «спят»), летом — как есть; лещина зимой с орехами', () => {
    const world = worldOn(['.B.H.']);
    const [bush, hazel] = world.objects.list;
    // Hazel ripens in autumn (step 1.11): in the spring of a new world it is bare — give it its nuts.
    expect(hazel!.state).toBe('empty');
    Object.assign(hazel!, { state: 'nuts', stock: 1 });
    expect(seasonalState(bush!, 'summer')).toBe('ripe');
    expect(seasonalState(bush!, 'winter')).toBe('empty');
    expect(seasonalState(hazel!, 'winter')).toBe('nuts');
    expect(seasonalState(hazel!, 'summer')).toBe('empty');
  });
});
