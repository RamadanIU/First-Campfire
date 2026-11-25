import { describe, expect, it } from 'vitest';
import { worldOn } from '../../tests/scenario.ts';
import { seasonalState } from './mapRenderer.ts';
import { drawRain, drawSnow, weatherTint } from './weather.ts';

/** A canvas context that only remembers its filled rectangles. */
function recorder() {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, rects };
}

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

  it('капли и снежинки — в мировых координатах: тот же кадр — те же пиксели, камера сдвинулась — сдвинулись и они', () => {
    const view = { x: 64, y: 32, width: 128, height: 96 };
    for (const draw of [drawRain, drawSnow]) {
      const a = recorder();
      const b = recorder();
      draw(a.ctx, view, 1500);
      draw(b.ctx, view, 1500);
      expect(a.rects.length).toBeGreaterThan(20);
      expect(a.rects).toEqual(b.rects);
      const moved = recorder();
      draw(moved.ctx, { ...view, x: view.x + 7 }, 1500);
      expect(moved.rects.map((r) => r.x + 7)).toEqual(a.rects.map((r) => r.x));
    }
  });
});

describe('сезон на карте', () => {
  it('малина зимой нарисована пустой (ягоды «спят»), летом — как есть; лещина зимой с орехами', () => {
    const world = worldOn(['.B.H.']);
    const [bush, hazel] = world.objects.list;
    expect(seasonalState(bush!, 'summer')).toBe('ripe');
    expect(seasonalState(bush!, 'winter')).toBe('empty');
    expect(seasonalState(hazel!, 'winter')).toBe('nuts');
    expect(seasonalState(hazel!, 'summer')).toBe('empty');
  });
});
