import { describe, expect, it } from 'vitest';
import {
  type Camera,
  cameraLayout,
  clampCamera,
  fitZoom,
  moveCamera,
  pixelScale,
  type ScreenSize,
  screenToWorld,
  worldToScreen,
  ZOOMS,
  zoomCameraAt,
  zoomStep,
} from './camera.ts';

const MAP = { width: 1024, height: 1024 };
/** A world much larger than any screen here: the edges never interfere. */
const BIG = { width: 16384, height: 16384 };
const screen = (width: number, height: number, pixelRatio = 1): ScreenSize => ({
  width,
  height,
  pixelRatio,
});
const HD = screen(1280, 720);
const FOCUS = { x: 600, y: 520 };

/** Deterministic pseudo-random numbers for the property checks (no Math.random in tests). */
function* numbers(seed: number): Generator<number> {
  let state = seed;
  for (;;) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    yield state / 4294967296;
  }
}

describe('ступени зума', () => {
  it('четыре ступени GDD §10.1: ×0,5, ×1, ×2, ×4; шаг ближе и дальше — в их пределах', () => {
    expect(ZOOMS).toEqual([0.5, 1, 2, 4]);
    expect(zoomStep(1, 1)).toBe(2);
    expect(zoomStep(2, 1)).toBe(4);
    expect(zoomStep(4, 1)).toBe(4);
    expect(zoomStep(1, -1)).toBe(0.5);
    expect(zoomStep(0.5, -1)).toBe(0.5);
    expect(zoomStep(0.5, 3)).toBe(4);
  });

  it('ступень — целое число физических пикселей на пиксель мира (или каждый второй на ×0,5)', () => {
    const table = (ratio: number) => ZOOMS.map((zoom) => pixelScale(zoom, ratio));
    expect(table(1)).toEqual([0.5, 1, 2, 4]);
    // Windows 125 %: rounded down to whole pixels — one width for every pixel.
    expect(table(1.25)).toEqual([0.5, 1, 2, 4]);
    // 150 % and retina: twice as many device pixels.
    expect(table(1.5)).toEqual([1, 2, 4, 8]);
    expect(table(2)).toEqual([1, 2, 4, 8]);
    expect(table(3)).toEqual([1, 3, 6, 12]);
    expect(table(0.75)).toEqual([0.5, 1, 2, 4]);
  });
});

describe('вид при открытии (как прежний неподвижный вид шага 1.1)', () => {
  it('карта помещается — по центру в наибольшем целом масштабе, видна целиком', () => {
    const window = screen(1088, 1088);
    const zoom = fitZoom(window, MAP);
    expect(zoom).toBe(1);
    expect(cameraLayout({ ...FOCUS, zoom }, window, MAP)).toEqual({
      scale: 1,
      offsetX: 32,
      offsetY: 32,
      view: { x: 0, y: 0, width: 1024, height: 1024 },
    });
    expect(fitZoom(screen(2200, 2100), MAP)).toBe(2);
    expect(fitZoom(screen(9000, 9000), MAP)).toBe(4);
    // Nothing fits: ×1 (a part is seen), not ×0.5.
    expect(fitZoom(HD, MAP)).toBe(1);
    // In device pixels: a retina window of 1088 CSS px is 2176 device px — ×1 is 2 pixels each.
    expect(fitZoom(screen(2176, 2176, 2), MAP)).toBe(1);
    expect(cameraLayout({ ...FOCUS, zoom: 1 }, screen(2176, 2176, 2), MAP).scale).toBe(2);
  });

  it('не помещается — центр на точке внимания, без пустых полос за краем карты', () => {
    const fit = cameraLayout({ ...FOCUS, zoom: 1 }, HD, MAP);
    expect(fit.scale).toBe(1);
    expect(fit.offsetX).toBe(128); // the width fits: centred
    expect(fit.offsetY).toBe(360 - 520);
    expect(fit.view).toEqual({ x: 0, y: 160, width: 1024, height: 720 });

    const corner = cameraLayout({ x: 10, y: 1000, zoom: 2 }, HD, MAP);
    expect([corner.offsetX, corner.offsetY]).toEqual([0, 720 - 2048]);
    expect(corner.view).toEqual({ x: 0, y: 664, width: 640, height: 360 });
  });

  it('zoom= задаёт ступень; положение — целые пиксели, окно закрыто картой', () => {
    const fit = cameraLayout({ x: 333.3, y: 517.7, zoom: 4 }, screen(1281, 721), MAP);
    expect(fit.scale).toBe(4);
    for (const value of [fit.offsetX, fit.offsetY, fit.view.x, fit.view.y]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(fit.offsetX + (fit.view.x + fit.view.width) * 4).toBeGreaterThanOrEqual(1281);
    expect(fit.offsetY + (fit.view.y + fit.view.height) * 4).toBeGreaterThanOrEqual(721);
    expect(fit.offsetX + fit.view.x * 4).toBeLessThanOrEqual(0);
  });
});

describe('×0,5 — край', () => {
  it('карта 64×64 целиком в окне 1280×720: 512 пикселей, по центру', () => {
    const half = cameraLayout({ ...FOCUS, zoom: 0.5 }, HD, MAP);
    expect(half).toEqual({
      scale: 0.5,
      offsetX: 640 - 256,
      offsetY: 360 - 256,
      view: { x: 0, y: 0, width: 1024, height: 1024 },
    });
  });

  it('угол видимой части — чётный пиксель мира, где бы ни стояла камера: картинка не мерцает', () => {
    const random = numbers(5);
    for (let i = 0; i < 500; i++) {
      const camera: Camera = {
        x: random.next().value! * BIG.width,
        y: random.next().value! * BIG.height,
        zoom: 0.5,
      };
      const layout = cameraLayout(camera, HD, BIG);
      expect(layout.view.x % 2).toBe(0);
      expect(layout.view.y % 2).toBe(0);
      expect(Number.isInteger(layout.offsetX) && Number.isInteger(layout.offsetY)).toBe(true);
      // The view covers the screen: from its left edge to its right one.
      expect(layout.offsetX + layout.view.x * 0.5).toBeLessThanOrEqual(0);
      expect(layout.offsetX + (layout.view.x + layout.view.width) * 0.5).toBeGreaterThanOrEqual(
        1280,
      );
    }
  });
});

describe('экран ↔ мир', () => {
  it('туда и обратно — та же точка; на целой ступени пиксель мира — целые пиксели экрана', () => {
    const random = numbers(11);
    for (const zoom of ZOOMS) {
      for (const ratio of [1, 1.25, 2]) {
        const window = screen(Math.round(1280 * ratio), Math.round(720 * ratio), ratio);
        const layout = cameraLayout({ x: 3000.7, y: 2000.2, zoom }, window, BIG);
        for (let i = 0; i < 50; i++) {
          const x = random.next().value! * window.width;
          const y = random.next().value! * window.height;
          const world = screenToWorld(layout, x, y);
          const back = worldToScreen(layout, world.x, world.y);
          expect(back.x).toBeCloseTo(x, 9);
          expect(back.y).toBeCloseTo(y, 9);
        }
        if (layout.scale >= 1) {
          const corner = worldToScreen(layout, 1234, 567);
          expect(Number.isInteger(corner.x) && Number.isInteger(corner.y)).toBe(true);
        }
      }
    }
  });

  it('центр экрана — точка камеры (с точностью до округления до целого пикселя)', () => {
    const layout = cameraLayout({ x: 3000.4, y: 2000.6, zoom: 2 }, HD, BIG);
    const middle = screenToWorld(layout, 640, 360);
    expect(Math.abs(middle.x - 3000.4)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(middle.y - 2000.6)).toBeLessThanOrEqual(0.25);
  });
});

describe('края карты', () => {
  it('камера не уходит за края: окно всегда закрыто картой, где она больше окна', () => {
    const random = numbers(3);
    for (const zoom of [1, 2, 4] as const) {
      for (let i = 0; i < 300; i++) {
        const wild: Camera = {
          x: (random.next().value! - 0.5) * 6000,
          y: (random.next().value! - 0.5) * 6000,
          zoom,
        };
        const layout = cameraLayout(wild, HD, MAP);
        const right = layout.offsetX + MAP.width * layout.scale;
        const bottom = layout.offsetY + MAP.height * layout.scale;
        if (MAP.width * layout.scale >= HD.width) {
          expect(layout.offsetX).toBeLessThanOrEqual(0);
          expect(right).toBeGreaterThanOrEqual(HD.width);
        } else {
          expect(layout.offsetX).toBe((HD.width - MAP.width * layout.scale) / 2); // centred
        }
        expect(layout.offsetY).toBeLessThanOrEqual(0);
        expect(bottom).toBeGreaterThanOrEqual(HD.height);
      }
    }
  });

  it('у самого края карта доходит ровно до края окна', () => {
    const topLeft = cameraLayout({ x: -500, y: -500, zoom: 2 }, HD, MAP);
    expect([topLeft.offsetX, topLeft.offsetY]).toEqual([0, 0]);
    const bottomRight = cameraLayout({ x: 9999, y: 9999, zoom: 2 }, HD, MAP);
    expect(bottomRight.offsetX + 2048).toBe(1280);
    expect(bottomRight.offsetY + 2048).toBe(720);
    expect(clampCamera({ x: 9999, y: -1, zoom: 4 }, HD, MAP)).toEqual({
      x: 1024 - 160,
      y: 90,
      zoom: 4,
    });
  });

  it('карта меньше окна (×0,5) — стоит в центре, двигать её некуда', () => {
    const camera: Camera = { x: 512, y: 512, zoom: 0.5 };
    expect(moveCamera(camera, 300, -200, HD, MAP)).toEqual(camera);
    expect(clampCamera({ x: 0, y: 1024, zoom: 0.5 }, HD, MAP)).toEqual(camera);
  });
});

describe('перемещение', () => {
  it('перетаскивание: точка мира под указателем идёт вместе с ним, пиксель в пиксель', () => {
    const random = numbers(7);
    for (const zoom of [1, 2, 4] as const) {
      let camera: Camera = { x: 5000, y: 5000, zoom };
      for (let i = 0; i < 100; i++) {
        const from = { x: random.next().value! * 1280, y: random.next().value! * 720 };
        const dx = Math.round((random.next().value! - 0.5) * 200);
        const dy = Math.round((random.next().value! - 0.5) * 200);
        const grabbed = screenToWorld(cameraLayout(camera, HD, BIG), from.x, from.y);
        camera = moveCamera(camera, -dx, -dy, HD, BIG);
        const now = screenToWorld(cameraLayout(camera, HD, BIG), from.x + dx, from.y + dy);
        expect(now.x).toBeCloseTo(grabbed.x, 9);
        expect(now.y).toBeCloseTo(grabbed.y, 9);
      }
    }
  });

  it('у края перемещение упирается в край', () => {
    const moved = moveCamera({ x: 400, y: 400, zoom: 1 }, 0, -1000, HD, MAP);
    expect(moved.y).toBe(360);
  });
});

describe('зум к точке под курсором', () => {
  it('точка мира под курсором остаётся под курсором (до полупикселя) на всех переходах', () => {
    const random = numbers(17);
    for (const ratio of [1, 1.25, 2]) {
      const window = screen(Math.round(1280 * ratio), Math.round(720 * ratio), ratio);
      for (const from of ZOOMS) {
        for (const to of ZOOMS) {
          if (from === to) continue;
          for (let i = 0; i < 40; i++) {
            const camera: Camera = {
              x: 4000 + random.next().value! * 8000,
              y: 4000 + random.next().value! * 8000,
              zoom: from,
            };
            const at = {
              x: Math.floor(random.next().value! * window.width),
              y: Math.floor(random.next().value! * window.height),
            };
            const point = screenToWorld(cameraLayout(camera, window, BIG), at.x, at.y);
            const zoomed = zoomCameraAt(camera, to, at, window, BIG);
            expect(zoomed.zoom).toBe(to);
            const there = worldToScreen(cameraLayout(zoomed, window, BIG), point.x, point.y);
            expect(Math.abs(there.x - at.x)).toBeLessThanOrEqual(0.5);
            expect(Math.abs(there.y - at.y)).toBeLessThanOrEqual(0.5);
          }
        }
      }
    }
  });

  it('приближение к точке у центра на целых ступенях — точно в ту же точку', () => {
    const camera: Camera = { x: 600, y: 520, zoom: 1 };
    const at = { x: 300, y: 200 };
    const point = screenToWorld(cameraLayout(camera, HD, MAP), at.x, at.y);
    const closer = zoomCameraAt(camera, 2, at, HD, MAP);
    expect(screenToWorld(cameraLayout(closer, HD, MAP), at.x, at.y)).toEqual(point);
    const closest = zoomCameraAt(closer, 4, at, HD, MAP);
    expect(screenToWorld(cameraLayout(closest, HD, MAP), at.x, at.y)).toEqual(point);
  });

  it('у края карты край важнее: камера не выходит за него, даже если точка уйдёт', () => {
    // The cursor near the top-left corner of the map at ×4; zooming out to ×1 would need the
    // view to go beyond the corner — it stops at it.
    const near: Camera = { x: 170, y: 100, zoom: 4 };
    const out = zoomCameraAt(near, 1, { x: 20, y: 20 }, HD, MAP);
    expect(out).toEqual(clampCamera(out, HD, MAP));
    const layout = cameraLayout(out, HD, MAP);
    expect(layout.offsetY).toBe(0);
    // ×0.5: the whole map, in the middle, wherever the cursor was.
    expect(zoomCameraAt(near, 0.5, { x: 20, y: 20 }, HD, MAP)).toEqual({
      x: 512,
      y: 512,
      zoom: 0.5,
    });
  });
});
