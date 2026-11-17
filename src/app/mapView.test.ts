import { describe, expect, it } from 'vitest';
import { fitView } from './mapView.ts';

const FOCUS = { x: 600, y: 520 };

describe('карта в окне', () => {
  it('помещается — по центру в наибольшем целом масштабе, видна целиком', () => {
    expect(fitView(1088, 1088, 1024, 1024, null, FOCUS)).toEqual({
      scale: 1,
      offsetX: 32,
      offsetY: 32,
      view: { x: 0, y: 0, width: 1024, height: 1024 },
    });
    expect(fitView(2200, 2100, 1024, 1024, null, FOCUS).scale).toBe(2);
    expect(fitView(9000, 9000, 1024, 1024, null, FOCUS).scale).toBe(4);
  });

  it('не помещается — центр на точке внимания, без пустых полос за краем карты', () => {
    const fit = fitView(1280, 720, 1024, 1024, null, FOCUS);
    expect(fit.scale).toBe(1);
    expect(fit.offsetX).toBe(128); // the width fits: centred
    expect(fit.offsetY).toBe(360 - 520);
    expect(fit.view).toEqual({ x: 0, y: 160, width: 1024, height: 720 });

    const corner = fitView(1280, 720, 1024, 1024, 2, { x: 10, y: 1000 });
    expect([corner.offsetX, corner.offsetY]).toEqual([0, 720 - 2048]);
    expect(corner.view).toEqual({ x: 0, y: 664, width: 640, height: 360 });
  });

  it('zoom= задаёт масштаб; положение — целые пиксели', () => {
    const fit = fitView(1281, 721, 1024, 1024, 4, { x: 333.3, y: 517.7 });
    expect(fit.scale).toBe(4);
    for (const value of [fit.offsetX, fit.offsetY, fit.view.x, fit.view.y]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    // The view covers the whole window.
    expect(fit.offsetX + (fit.view.x + fit.view.width) * 4).toBeGreaterThanOrEqual(1281);
    expect(fit.offsetY + (fit.view.y + fit.view.height) * 4).toBeGreaterThanOrEqual(721);
    expect(fit.offsetX + fit.view.x * 4).toBeLessThanOrEqual(0);
  });
});
