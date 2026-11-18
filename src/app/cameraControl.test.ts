import { describe, expect, it } from 'vitest';
import { cameraLayout, pixelScale, screenToWorld } from '../render/camera.ts';
import {
  cameraKey,
  createCameraControl,
  createGestures,
  createWheelZoom,
  FLY_MS,
  heldDirection,
  KEY_PAN_SPEED,
  PINCH_STEP,
  TAP_SLOP,
  WHEEL_QUIET_MS,
  wheelPixels,
  ZOOM_MS,
} from './cameraControl.ts';

const MAP = { width: 1024, height: 1024 };
const BIG = { width: 16384, height: 16384 };
const HD = { width: 1280, height: 720, pixelRatio: 1 };

/** Run the control's smooth motion for `ms` at `fps` frames per second. */
function run(control: ReturnType<typeof createCameraControl>, ms: number, fps = 60): void {
  const frame = 1000 / fps;
  for (let t = 0; t < ms - 1e-9; t += frame) control.update(Math.min(frame, ms - t));
}

describe('клавиши камеры', () => {
  it('WASD и стрелки двигают, +/− приближают; остальные клавиши — не камеры', () => {
    expect(cameraKey('KeyW')).toEqual({ kind: 'move', x: 0, y: -1 });
    expect(cameraKey('KeyA')).toEqual({ kind: 'move', x: -1, y: 0 });
    expect(cameraKey('KeyS')).toEqual({ kind: 'move', x: 0, y: 1 });
    expect(cameraKey('KeyD')).toEqual({ kind: 'move', x: 1, y: 0 });
    expect(cameraKey('ArrowUp')).toEqual({ kind: 'move', x: 0, y: -1 });
    expect(cameraKey('ArrowRight')).toEqual({ kind: 'move', x: 1, y: 0 });
    expect(cameraKey('Equal', '=')).toEqual({ kind: 'zoom', by: 1 });
    expect(cameraKey('NumpadAdd', '+')).toEqual({ kind: 'zoom', by: 1 });
    expect(cameraKey('Minus', '-')).toEqual({ kind: 'zoom', by: -1 });
    expect(cameraKey('NumpadSubtract', '-')).toEqual({ kind: 'zoom', by: -1 });
    // «+» where it sits elsewhere on the keyboard.
    expect(cameraKey('BracketRight', '+')).toEqual({ kind: 'zoom', by: 1 });
    // Speed keys and others are not the camera's.
    for (const code of ['Space', 'Digit1', 'Digit4', 'KeyQ', 'Enter'])
      expect(cameraKey(code)).toBeNull();
  });

  it('направление от зажатых клавиш: противоположные гасят друг друга, по диагонали — обе оси', () => {
    expect(heldDirection([])).toEqual({ x: 0, y: 0 });
    expect(heldDirection(['KeyD'])).toEqual({ x: 1, y: 0 });
    expect(heldDirection(['KeyD', 'ArrowRight'])).toEqual({ x: 1, y: 0 });
    expect(heldDirection(['KeyA', 'KeyD'])).toEqual({ x: 0, y: 0 });
    expect(heldDirection(['KeyW', 'ArrowLeft'])).toEqual({ x: -1, y: -1 });
  });
});

describe('колесо', () => {
  it('щелчок колеса — одна ступень: вверх ближе, вниз дальше', () => {
    const wheel = createWheelZoom();
    expect(wheel(-100, 0)).toBe(1);
    expect(wheel(100, 1000)).toBe(-1);
  });

  it('тачпад: мелкая прокрутка копится до ступени; остаток взмаха не пролетает все ступени', () => {
    const wheel = createWheelZoom();
    const steps: number[] = [];
    // A swipe: 60 small scrolls of −4 px, one every 8 ms (≈ 0.5 s).
    for (let i = 0; i < 60; i++) steps.push(wheel(-4, i * 8));
    const taken = steps.filter((step) => step !== 0);
    expect(taken.every((step) => step === 1)).toBe(true);
    expect(taken.length).toBeGreaterThanOrEqual(1);
    expect(taken.length).toBeLessThanOrEqual(3);
    // The first step comes after 40 px of scrolling.
    expect(steps.indexOf(1)).toBe(9);
  });

  it('после ступени — короткая пауза; давняя прокрутка забывается; смена направления — заново', () => {
    const wheel = createWheelZoom();
    expect(wheel(-100, 0)).toBe(1);
    expect(wheel(-100, WHEEL_QUIET_MS / 2)).toBe(0);
    expect(wheel(-100, WHEEL_QUIET_MS + 10)).toBe(1);
    expect(wheel(-30, 2000)).toBe(0);
    expect(wheel(-30, 3000)).toBe(0); // the first 30 px were long ago
    expect(wheel(25, 3010)).toBe(0); // the other way: starts over
    expect(wheel(20, 3020)).toBe(-1);
  });

  it('прокрутка строками и страницами переводится в пиксели', () => {
    expect(wheelPixels(-100, 0)).toBe(-100);
    expect(wheelPixels(3, 1)).toBe(60);
    expect(wheelPixels(1, 2)).toBe(400);
  });
});

describe('жесты указателей', () => {
  it('один указатель тащит картинку на свой путь', () => {
    const gestures = createGestures();
    gestures.down(1, 100, 100, 0);
    let dx = 0;
    let dy = 0;
    for (let i = 1; i <= 10; i++) {
      for (const command of gestures.move(1, 100 + i * 7, 100 - i * 3, i * 16)) {
        if (command.kind === 'drag') {
          dx += command.dx;
          dy += command.dy;
        }
      }
    }
    expect([dx, dy]).toEqual([70, -30]);
    // Stood still before release: nothing to throw.
    expect(gestures.up(1, 400)).toEqual([{ kind: 'release', vx: 0, vy: 0 }]);
    expect(gestures.count).toBe(0);
  });

  it('отпустил на ходу — скорость за последние 100 мс бросает картинку дальше', () => {
    const gestures = createGestures();
    gestures.down(1, 0, 0, 0);
    for (let i = 1; i <= 20; i++) gestures.move(1, i * 10, i * 5, i * 10);
    const [release] = gestures.up(1, 205);
    expect(release).toEqual({ kind: 'release', vx: 1000, vy: 500 });
  });

  it('два пальца: середина тащит, разведение в 1,4 раза — ступень ближе, сведение — дальше', () => {
    const gestures = createGestures();
    gestures.down(1, 500, 300, 0);
    gestures.down(2, 600, 300, 10); // 100 px apart, midpoint (550, 300)
    const zooms: { by: number; x: number; y: number }[] = [];
    let dx = 0;
    const apply = (commands: ReturnType<typeof gestures.move>) => {
      for (const command of commands) {
        if (command.kind === 'zoom') zooms.push(command);
        if (command.kind === 'drag') dx += command.dx;
      }
    };
    // Spread symmetrically: the midpoint stays, the distance grows to 150 (× 1.5).
    for (let i = 1; i <= 5; i++) {
      apply(gestures.move(1, 500 - i * 5, 300, 20 + i));
      apply(gestures.move(2, 600 + i * 5, 300, 20 + i));
    }
    expect(dx).toBeCloseTo(0, 9);
    expect(zooms).toHaveLength(1);
    expect(zooms[0]!.by).toBe(1);
    expect(zooms[0]!.y).toBe(300);
    expect(Math.abs(zooms[0]!.x - 550)).toBeLessThanOrEqual(5);
    // Pinch back below 1/1.4 of the distance at that step (140 → 86): a step farther.
    for (let i = 1; i <= 8; i++) {
      apply(gestures.move(1, 475 + i * 4, 300, 40 + i));
      apply(gestures.move(2, 625 - i * 4, 300, 40 + i));
    }
    expect(zooms.map((zoom) => zoom.by)).toEqual([1, -1]);
    // On to 54: another step (a step is counted from the distance at the previous one).
    for (let i = 9; i <= 12; i++) {
      apply(gestures.move(1, 475 + i * 4, 300, 40 + i));
      apply(gestures.move(2, 625 - i * 4, 300, 40 + i));
    }
    expect(zooms.map((zoom) => zoom.by)).toEqual([1, -1, -1]);
    expect(PINCH_STEP).toBe(1.4);
  });

  it('два пальца двигаются вместе — картинка едет за серединой', () => {
    const gestures = createGestures();
    gestures.down(1, 100, 100, 0);
    gestures.down(2, 200, 100, 0);
    let dy = 0;
    for (const command of [...gestures.move(1, 100, 140, 10), ...gestures.move(2, 200, 140, 10)])
      if (command.kind === 'drag') dy += command.dy;
    expect(dy).toBe(40);
  });

  it('касание без движения — щелчок по миру: картинка не двигается, отпускание говорит где', () => {
    const gestures = createGestures();
    expect(gestures.down(1, 300, 200, 0)).toEqual([{ kind: 'drag', dx: 0, dy: 0 }]);
    // A hand trembles a few pixels: still a tap, the map stays put.
    expect(gestures.move(1, 303, 198, 40)).toEqual([]);
    expect(gestures.move(1, 299, 204, 80)).toEqual([]);
    expect(gestures.up(1, 120)).toEqual([
      { kind: 'release', vx: 0, vy: 0 },
      { kind: 'tap', x: 300, y: 200 },
    ]);
  });

  it('ушёл дальше нескольких пикселей — уже перетаскивание: картинка догоняет весь путь, щелчка нет', () => {
    const gestures = createGestures();
    gestures.down(1, 300, 200, 0);
    expect(gestures.move(1, 304, 200, 10)).toEqual([]);
    expect(gestures.move(1, 310, 196, 20)).toEqual([{ kind: 'drag', dx: 10, dy: -4 }]);
    expect(gestures.move(1, 311, 196, 30)).toEqual([{ kind: 'drag', dx: 1, dy: 0 }]);
    // Back to where it was pressed: still a drag.
    expect(gestures.move(1, 300, 200, 40)).toEqual([{ kind: 'drag', dx: -11, dy: 4 }]);
    const commands = gestures.up(1, 200);
    expect(commands.map((command) => command.kind)).toEqual(['release']);
  });

  it('порог щелчка — в физических пикселях экрана (на 125 % — больше)', () => {
    const gestures = createGestures({ slop: () => TAP_SLOP * 1.25 });
    gestures.down(1, 0, 0, 0);
    expect(gestures.move(1, 7, 0, 10)).toEqual([]);
    expect(gestures.move(1, 8, 0, 20)).toEqual([{ kind: 'drag', dx: 8, dy: 0 }]);
  });

  it('два пальца — никогда не щелчок, даже без движения', () => {
    const gestures = createGestures();
    gestures.down(1, 100, 100, 0);
    gestures.down(2, 200, 100, 0);
    expect(gestures.up(2, 50)).toEqual([]);
    expect(gestures.up(1, 60).map((command) => command.kind)).toEqual(['release']);
  });

  it('поднял один палец из двух — не бросок; оставшийся продолжает тащить', () => {
    const gestures = createGestures();
    gestures.down(1, 100, 100, 0);
    gestures.down(2, 200, 100, 0);
    expect(gestures.up(2, 50)).toEqual([]);
    expect(gestures.move(1, 110, 100, 60)).toEqual([{ kind: 'drag', dx: 10, dy: 0 }]);
    expect(gestures.move(5, 0, 0, 70)).toEqual([]); // an unknown pointer
  });
});

describe('управление камерой', () => {
  it('без zoom= — ×2 «улица» (выбор владельца, ADR-022); заданная ступень — как задана', () => {
    const control = createCameraControl(MAP, { x: 600, y: 520 }, null);
    control.resize(HD);
    expect(control.camera).toEqual({ x: 600, y: 520, zoom: 2 });
    expect(control.layout.scale).toBe(2);
    // The window changes later: the zoom is the observer's, it stays.
    control.resize({ width: 2200, height: 2100, pixelRatio: 1 });
    expect(control.camera.zoom).toBe(2);
    const asked = createCameraControl(MAP, { x: 600, y: 520 }, 0.5);
    asked.resize(HD);
    expect(asked.camera).toEqual({ x: 512, y: 512, zoom: 0.5 });
    expect(asked.zooming).toBe(false);
  });

  it('клавиши: разгон до постоянной скорости, после отпускания — плавная остановка', () => {
    const control = createCameraControl(BIG, { x: 8000, y: 8000 }, 2);
    control.resize(HD);
    control.hold({ x: 1, y: 0 });
    run(control, 1000);
    // ≈ KEY_PAN_SPEED px of the screen in a second, minus the speeding up (≈ 60 ms).
    const shifted = (control.camera.x - 8000) * 2;
    expect(shifted).toBeGreaterThan(KEY_PAN_SPEED * 0.9);
    expect(shifted).toBeLessThan(KEY_PAN_SPEED);
    expect(control.camera.y).toBe(8000);
    // A frame's step at full speed is small: smooth, not jumps.
    const before = control.camera.x;
    control.update(16);
    expect((control.camera.x - before) * 2).toBeCloseTo((KEY_PAN_SPEED * 16) / 1000, 0);

    control.hold({ x: 0, y: 0 });
    const released = control.camera.x;
    run(control, 100);
    const glide = control.camera.x - released;
    expect(glide).toBeGreaterThan(0); // slows down, does not stop dead
    run(control, 2000);
    const stopped = control.camera.x;
    run(control, 500);
    expect(control.camera.x).toBe(stopped); // and stops
    expect((stopped - released) * 2).toBeLessThan(KEY_PAN_SPEED * 0.3);
  });

  it('движение не зависит от частоты кадров', () => {
    const at = (fps: number) => {
      const control = createCameraControl(BIG, { x: 8000, y: 8000 }, 1);
      control.resize(HD);
      control.hold({ x: 1, y: 1 });
      run(control, 700, fps);
      control.hold({ x: 0, y: 0 });
      run(control, 1500, fps);
      return control.camera;
    };
    const slow = at(30);
    const fast = at(144);
    expect(Math.abs(slow.x - fast.x)).toBeLessThan(2);
    expect(Math.abs(slow.y - fast.y)).toBeLessThan(2);
    // Diagonal: not faster than straight.
    expect(slow.x - 8000).toBeLessThan(KEY_PAN_SPEED * 0.75);
  });

  it('клавиши у края: камера упирается и сразу уходит обратно (скорость не копится)', () => {
    const control = createCameraControl(MAP, { x: 512, y: 512 }, 2);
    control.resize(HD);
    control.hold({ x: -1, y: 0 });
    run(control, 3000);
    expect(control.camera.x).toBe(320); // the left edge: half the screen at ×2
    expect(control.layout.offsetX).toBe(0);
    control.hold({ x: 1, y: 0 });
    run(control, 100);
    expect(control.camera.x).toBeGreaterThan(320 + 10);
  });

  it('перетаскивание — один к одному; бросок — картинка катится дальше и останавливается', () => {
    const control = createCameraControl(BIG, { x: 8000, y: 8000 }, 2);
    control.resize(HD);
    const grabbed = screenToWorld(control.layout, 100, 100);
    control.drag(50, -20);
    expect(screenToWorld(control.layout, 150, 80)).toEqual(grabbed);
    control.release(1000, 0); // the pointer went right: the view goes left
    const thrown = control.camera.x;
    run(control, 100);
    expect(control.camera.x).toBeLessThan(thrown);
    run(control, 3000);
    const stopped = control.camera.x;
    run(control, 500);
    expect(control.camera.x).toBe(stopped);
    // A new touch stops a glide at once.
    control.release(-2000, 0);
    run(control, 16);
    control.drag(0, 0);
    const caught = control.camera.x;
    run(control, 500);
    expect(control.camera.x).toBe(caught);
  });

  it('зум клавишами — к центру экрана; колесом и пальцами — к точке под ними', () => {
    const control = createCameraControl(BIG, { x: 8000, y: 8000 }, 1);
    control.resize(HD);
    control.zoomBy(1);
    // Where the camera comes to rest is known at once; the picture glides there.
    expect(control.camera).toEqual({ x: 8000, y: 8000, zoom: 2 });
    run(control, ZOOM_MS);
    expect(control.zooming).toBe(false);
    const point = screenToWorld(control.layout, 200, 600);
    control.zoomBy(1, { x: 200, y: 600 });
    expect(control.camera.zoom).toBe(4);
    run(control, ZOOM_MS);
    expect(screenToWorld(control.layout, 200, 600)).toEqual(point);
    control.zoomBy(1, { x: 200, y: 600 }); // already the closest step
    expect(control.camera.zoom).toBe(4);
    expect(control.zooming).toBe(false);
    expect(control.layout).toEqual(cameraLayout(control.camera, HD, BIG));
  });

  it('зум плавный: масштаб растёт кадр за кадром и приходит ровно к ступени — снова резко', () => {
    for (const [from, by] of [
      [2, 1],
      [2, -1],
      [1, -1],
      [0.5, 1],
    ] as const) {
      const control = createCameraControl(BIG, { x: 8000, y: 8000 }, from);
      control.resize(HD);
      const at = { x: 300, y: 500 };
      const point = screenToWorld(control.layout, at.x, at.y);
      control.zoomBy(by, at);
      const to = control.camera.zoom;
      const scales = [control.layout.scale];
      let worst = 0;
      while (control.zooming) {
        control.update(1000 / 60);
        scales.push(control.layout.scale);
        // In every frame the world point under the cursor stays under it (to a screen pixel).
        const under = screenToWorld(control.layout, at.x, at.y);
        worst = Math.max(
          worst,
          Math.hypot(under.x - point.x, under.y - point.y) * control.layout.scale,
        );
      }
      // ≈ 250 ms at 60 frames a second: some 15 frames, each between the steps.
      expect(scales.length).toBeGreaterThanOrEqual(14);
      const inner = scales.slice(1, -1);
      expect(inner.every((scale) => !Number.isInteger(scale * 2))).toBe(true);
      const growing = by > 0;
      for (let i = 1; i < scales.length; i++) {
        if (growing) expect(scales[i]!).toBeGreaterThan(scales[i - 1]!);
        else expect(scales[i]!).toBeLessThan(scales[i - 1]!);
      }
      // The end is the step exactly: the crisp picture of the step, not a curve's end.
      expect(scales.at(-1)).toBe(pixelScale(to, 1));
      expect(control.layout).toEqual(cameraLayout(control.camera, HD, BIG));
      expect(worst).toBeLessThanOrEqual(1);
    }
  });

  it('зум идёт столько же при любой частоте кадров', () => {
    for (const fps of [30, 60, 144]) {
      const control = createCameraControl(BIG, { x: 8000, y: 8000 }, 2);
      control.resize(HD);
      control.zoomBy(1);
      run(control, ZOOM_MS - 20, fps);
      expect(control.zooming).toBe(true);
      run(control, 40, fps);
      expect(control.zooming).toBe(false);
    }
  });

  it('второй щелчок колеса посреди зума — без скачка: дальше от того, что на экране', () => {
    const control = createCameraControl(BIG, { x: 8000, y: 8000 }, 1);
    control.resize(HD);
    const at = { x: 900, y: 200 };
    const point = screenToWorld(control.layout, at.x, at.y);
    control.zoomBy(1, at);
    run(control, ZOOM_MS / 2);
    const halfway = control.layout.scale;
    expect(halfway).toBeGreaterThan(1);
    expect(halfway).toBeLessThan(2);
    control.zoomBy(1, at);
    expect(control.camera.zoom).toBe(4);
    // The next frame goes on from the picture on screen.
    control.update(1000 / 60);
    expect(control.layout.scale).toBeGreaterThan(halfway);
    expect(control.layout.scale).toBeLessThan(halfway * 1.3);
    run(control, ZOOM_MS);
    expect(control.layout.scale).toBe(4);
    const under = screenToWorld(control.layout, at.x, at.y);
    expect(Math.hypot(under.x - point.x, under.y - point.y) * 4).toBeLessThanOrEqual(1);
  });

  it('перетаскивание посреди зума — картинка едет за пальцем, зум доходит до ступени', () => {
    const control = createCameraControl(BIG, { x: 8000, y: 8000 }, 2);
    control.resize(HD);
    control.zoomBy(1, { x: 640, y: 360 });
    run(control, 100);
    const grabbed = screenToWorld(control.layout, 400, 300);
    control.drag(60, 40);
    const under = screenToWorld(control.layout, 460, 340);
    expect(
      Math.hypot(under.x - grabbed.x, under.y - grabbed.y) * control.layout.scale,
    ).toBeLessThanOrEqual(1);
    run(control, ZOOM_MS);
    expect(control.zooming).toBe(false);
    expect(control.layout).toEqual(cameraLayout(control.camera, HD, BIG));
    // Rest: the point the zoom held, moved with the finger (60, 40 screen px at the scale then).
    expect(control.camera.zoom).toBe(4);
  });

  it('отдаление у края карты — без скачка: картинка плавно приходит к краю', () => {
    const LAND = { width: 4096, height: 4096 };
    // At ×2 near the top-left corner; zooming out at the far corner of the screen would take
    // the view beyond the map — the edges hold it, and the picture glides to them.
    const control = createCameraControl(LAND, { x: 330, y: 200 }, 2);
    control.resize(HD);
    control.zoomBy(-1, { x: 1200, y: 700 });
    let previous = control.layout;
    let frames = 0;
    while (control.zooming) {
      control.update(1000 / 60);
      frames++;
      const { layout } = control;
      // Never beyond the map's edges, and no jump of the picture between frames.
      expect(layout.offsetX).toBeLessThanOrEqual(0);
      expect(layout.offsetY).toBeLessThanOrEqual(0);
      expect(Math.abs(layout.offsetX - previous.offsetX)).toBeLessThan(80);
      expect(Math.abs(layout.offsetY - previous.offsetY)).toBeLessThan(80);
      previous = layout;
    }
    expect(frames).toBeGreaterThan(10);
    expect(control.camera).toEqual({ x: 640, y: 360, zoom: 1 });
    expect(control.layout).toEqual(cameraLayout(control.camera, HD, LAND));
    expect(control.layout.offsetX).toBe(0);
    expect(control.layout.offsetY).toBe(0);
  });

  it('изменение окна посреди зума — сразу ступень', () => {
    const control = createCameraControl(BIG, { x: 8000, y: 8000 }, 2);
    control.resize(HD);
    control.zoomBy(1);
    run(control, 50);
    expect(control.zooming).toBe(true);
    const window = { width: 1000, height: 700, pixelRatio: 1 };
    control.resize(window);
    expect(control.zooming).toBe(false);
    expect(control.layout).toEqual(cameraLayout(control.camera, window, BIG));
  });

  it('экран с дробным масштабом: скорость клавиш — в CSS-пикселях, масштаб — целый', () => {
    const control = createCameraControl(BIG, { x: 8000, y: 8000 }, 2);
    control.resize({ width: 1600, height: 900, pixelRatio: 1.25 });
    expect(control.layout.scale).toBe(2);
    control.hold({ x: 1, y: 0 });
    run(control, 1000);
    const cssShifted = ((control.camera.x - 8000) * 2) / 1.25;
    expect(cssShifted).toBeGreaterThan(KEY_PAN_SPEED * 0.9);
    expect(cssShifted).toBeLessThan(KEY_PAN_SPEED);
  });
});

describe('полёт камеры к точке (шаг 1.6: щелчок по событию)', () => {
  it(`долетает за FLY_MS плавно, без рывков, и встаёт точно в точку`, () => {
    const control = createCameraControl(MAP, { x: 200, y: 200 }, 2);
    control.resize(HD);
    control.flyTo({ x: 700, y: 600 });
    expect(control.flying).toBe(true);
    const xs: number[] = [];
    for (let t = 0; t < FLY_MS; t += 1000 / 60) {
      control.update(1000 / 60);
      xs.push(control.camera.x);
    }
    run(control, 100);
    expect(control.flying).toBe(false);
    expect(control.camera).toMatchObject({ x: 700, y: 600, zoom: 2 });
    // Monotonic, slow at the start and at the end, fastest in the middle.
    const steps = xs.slice(1).map((x, i) => x - xs[i]!);
    expect(steps.every((step) => step >= 0)).toBe(true);
    const middle = steps[Math.floor(steps.length / 2)]!;
    expect(steps[0]!).toBeLessThan(middle / 4);
    expect(steps[steps.length - 2]!).toBeLessThan(middle / 4);
  });

  it('точку у края карты — насколько пускает край; ступень не меняется', () => {
    const control = createCameraControl(MAP, { x: 512, y: 512 }, 2);
    control.resize(HD);
    control.flyTo({ x: 0, y: 1024 });
    run(control, FLY_MS + 50);
    const clamped = cameraLayout({ x: 0, y: 1024, zoom: 2 }, HD, MAP);
    expect(control.layout.offsetX).toBe(clamped.offsetX);
    expect(control.layout.offsetY).toBe(clamped.offsetY);
    expect(control.camera.zoom).toBe(2);
  });

  it('перетаскивание, клавиши и зум останавливают полёт там, где он есть', () => {
    for (const interrupt of [
      (c: ReturnType<typeof createCameraControl>) => c.drag(5, 0),
      (c: ReturnType<typeof createCameraControl>) => c.hold({ x: 1, y: 0 }),
      (c: ReturnType<typeof createCameraControl>) => c.zoomBy(1),
    ]) {
      const control = createCameraControl(MAP, { x: 200, y: 200 }, 2);
      control.resize(HD);
      control.flyTo({ x: 800, y: 800 });
      run(control, FLY_MS / 2);
      interrupt(control);
      expect(control.flying).toBe(false);
      control.hold({ x: 0, y: 0 });
      run(control, FLY_MS);
      expect(control.camera.x).toBeLessThan(700);
    }
  });

  it('полёт во время зума: зум сразу встаёт на ступень, картинка резкая', () => {
    const control = createCameraControl(MAP, { x: 512, y: 512 }, 2);
    control.resize(HD);
    control.zoomBy(1);
    run(control, ZOOM_MS / 3);
    expect(control.zooming).toBe(true);
    control.flyTo({ x: 400, y: 400 });
    expect(control.zooming).toBe(false);
    expect(control.layout.scale).toBe(pixelScale(4, 1));
  });
});
