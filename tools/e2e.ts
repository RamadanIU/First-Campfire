/**
 * End-to-end check in a real browser (step 0.7): the menu, a new world, a page reload, saving to
 * a file and loading it back, bad saves and files, blocked and full browser storage; the camera
 * of the world (step 1.2) under a real mouse, wheel, keyboard and fingers, also on a screen with
 * a fractional pixel ratio. Every check prints ✓ or ✗; the exit code is 1 if any failed — or if a
 * page reported an error.
 *
 *   npm run e2e                 build the game, then run every scenario (≈ 30 s)
 *   npm run e2e -- --no-build   reuse dist/
 *
 * Not part of `npm run check` (it needs Chromium and takes time): run it when the menu, the
 * world scene or saves change, and at stage reviews. The world is read from `window.__fc.world`
 * (src/main.ts), not from the screen, so a new look of the world scene does not break it; the
 * camera — from `window.__fc.camera` (src/app/mapView.ts). Touches go through the Chrome DevTools
 * protocol (Input.dispatchTouchEvent): Playwright itself can only tap.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { saveWorld } from '../src/sim/save.ts';
import { createWorld, runTicks } from '../src/sim/world.ts';
import { buildGame, chromium, hasBuild, serveGame } from './browser.ts';

/** The part of Playwright's Page the checks use. */
interface Page {
  goto(url: string): Promise<unknown>;
  reload(): Promise<unknown>;
  url(): string;
  on(event: 'pageerror', listener: (error: Error) => void): void;
  on(event: 'console', listener: (message: { type(): string; text(): string }) => void): void;
  waitForFunction(script: string, arg?: unknown, options?: { timeout: number }): Promise<unknown>;
  waitForURL(pattern: string): Promise<void>;
  waitForSelector(selector: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForEvent(event: 'download'): Promise<Download>;
  evaluate<T>(script: string): Promise<T>;
  click(selector: string): Promise<void>;
  fill(selector: string, text: string): Promise<void>;
  press(selector: string, key: string): Promise<void>;
  isVisible(selector: string): Promise<boolean>;
  isHidden(selector: string): Promise<boolean>;
  setInputFiles(
    selector: string,
    files: string | { name: string; mimeType: string; buffer: Buffer },
  ): Promise<void>;
  keyboard: {
    press(key: string): Promise<void>;
    down(key: string): Promise<void>;
    up(key: string): Promise<void>;
  };
  mouse: {
    move(x: number, y: number, options?: { steps: number }): Promise<void>;
    down(): Promise<void>;
    up(): Promise<void>;
    wheel(dx: number, dy: number): Promise<void>;
    click(x: number, y: number): Promise<void>;
  };
}

/** The part of Playwright's BrowserContext the checks use. */
interface Context {
  newPage(): Promise<Page>;
  addInitScript<A>(script: (arg: A) => void, arg?: A): Promise<void>;
  newCDPSession(page: Page): Promise<{ send(method: string, params: object): Promise<unknown> }>;
  close(): Promise<void>;
}

/** Fingers on the touch screen (CSS pixels): every finger of the gesture in each call. */
interface Fingers {
  start(points: Point[]): Promise<void>;
  move(points: Point[]): Promise<void>;
  end(): Promise<void>;
}

interface Point {
  x: number;
  y: number;
}

/** The camera of the world scene (src/app/mapView.ts, CameraInfo). */
interface CameraState {
  zoom: number;
  scale: number;
  zooming: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelRatio: number;
  offsetX: number;
  offsetY: number;
  view: { x: number; y: number; width: number; height: number };
}

/** A villager as the scene `world` tells checks (src/main.ts, VillagerInfo). */
interface VillagerState {
  id: number;
  sex: string;
  x: number;
  y: number;
  toX: number;
  toY: number;
  action: string;
  goal: { x: number; y: number } | null;
  walked: number;
  needs: { food: number; water: number };
  health: number;
}

interface Download {
  suggestedFilename(): string;
  saveAs(path: string): Promise<void>;
}

interface World {
  seed: number;
  tick: number;
  hash: string;
  origin: string;
  savedTick: number | null;
  /** The world when the scene opened it (it runs on at once). */
  opened: { tick: number; hash: string };
}

const { values } = parseArgs({ options: { 'no-build': { type: 'boolean', default: false } } });
if (!values['no-build']) buildGame();
if (!hasBuild()) throw new Error('Нет dist/index.html — сборка не выполнена');

const server = await serveGame();
const browser = await chromium().launch();
const temp = mkdtempSync(join(tmpdir(), 'fc-e2e-'));
let failed = 0;

function check(ok: boolean, text: string): void {
  console.log(`${ok ? '✓' : '✗'} ${text}`);
  if (!ok) failed++;
}

/** Text of an element as shown (lines joined by « · »), or '' if there is none. */
async function text(page: Page, selector: string): Promise<string> {
  const shown = await page.evaluate<string>(
    `document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`,
  );
  return shown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' · ');
}

/**
 * A fresh browser (empty storage) with a 1280×720 window; `init(initArg)` runs in every page
 * before the game; `pixelRatio` — device pixels per CSS pixel; `touch` — a touch screen (fingers).
 */
async function scenario<A>(
  title: string,
  run: (page: Page, fingers: Fingers) => Promise<void>,
  setup: { init?: (arg: A) => void; initArg?: A; pixelRatio?: number; touch?: boolean } = {},
): Promise<void> {
  console.log(`\n${title}`);
  const context: Context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: setup.pixelRatio ?? 1,
    hasTouch: setup.touch ?? false,
    acceptDownloads: true,
  });
  if (setup.init) await context.addInitScript(setup.init, setup.initArg);
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const touch = await context.newCDPSession(page);
  const send = (type: string, points: Point[]) =>
    touch.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point, id) => ({ ...point, id })),
    });
  const fingers: Fingers = {
    start: async (points) => {
      await send('touchStart', points);
    },
    move: async (points) => {
      await send('touchMove', points);
    },
    end: async () => {
      await send('touchEnd', []);
    },
  };
  try {
    await run(page, fingers);
  } catch (error) {
    check(false, `сценарий прерван: ${error instanceof Error ? error.message : String(error)}`);
  }
  check(
    errors.length === 0,
    `ошибок на странице нет${errors.length ? `: ${errors.join(' | ')}` : ''}`,
  );
  await context.close();
}

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${server.origin}/${query}`);
  await ready(page);
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction('window.__fc && window.__fc.ready === true');
}

/** The world of the scene `world` (src/main.ts, WorldInfo). */
function world(page: Page): Promise<World> {
  return page.evaluate<World>(
    '(({ seed, tick, hash, origin, savedTick, opened }) => ({ seed, tick, hash: hash(), origin, savedTick, opened }))(window.__fc.world)',
  );
}

/** The camera of the world scene now. */
function camera(page: Page): Promise<CameraState> {
  return page.evaluate<CameraState>(
    '(({ zoom, scale, zooming, x, y, width, height, pixelRatio, offsetX, offsetY, view }) => ({ zoom, scale, zooming, x, y, width, height, pixelRatio, offsetX, offsetY, view }))(window.__fc.camera)',
  );
}

/** Wait until a zoom gliding between steps comes to its step (ADR-022). */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction('window.__fc.camera.zooming === false');
}

/**
 * Do `act` and record the camera every frame until the zoom it starts comes to rest: the scale
 * and the world point under page point `at` (CSS px) in each frame.
 */
async function recordZoom(
  page: Page,
  at: Point,
  act: () => Promise<void>,
): Promise<{ scale: number; point: Point }[]> {
  await page.evaluate(`(() => {
    const frames = (window.__zoomFrames = []);
    const camera = window.__fc.camera;
    let seen = false;
    const tick = () => {
      frames.push({ scale: camera.scale, point: camera.worldAt(${at.x}, ${at.y}) });
      seen = seen || camera.zooming;
      // Until the zoom has begun and come to rest (at most some 10 s of frames).
      if ((!seen || camera.zooming) && frames.length < 600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await act();
  await page.waitForFunction(
    'window.__fc.camera.zooming === true || window.__zoomFrames.length >= 600',
  );
  await settled(page);
  await page.waitForTimeout(100);
  return page.evaluate('window.__zoomFrames');
}

/** The world point (world pixels) under a point of the page (CSS pixels). */
function worldAt(page: Page, x: number, y: number): Promise<Point> {
  return page.evaluate<Point>(`window.__fc.camera.worldAt(${x}, ${y})`);
}

const near = (a: Point, b: Point, most: number) =>
  Math.abs(a.x - b.x) <= most && Math.abs(a.y - b.y) <= most;
const at = (point: Point) => `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`;

/** Drag the mouse from `from` to `to` (CSS px) and stand still before letting go: no throw. */
async function mouseDrag(page: Page, from: Point, to: Point, steps = 10): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

/** Move fingers from `from` to `to` (each — every finger) in `steps` moves and lift them. */
async function touchGesture(
  page: Page,
  fingers: Fingers,
  from: Point[],
  to: Point[],
  steps: number,
): Promise<void> {
  await fingers.start(from);
  for (let step = 1; step <= steps; step++) {
    await fingers.move(
      from.map((point, i) => ({
        x: point.x + ((to[i]!.x - point.x) * step) / steps,
        y: point.y + ((to[i]!.y - point.y) * step) / steps,
      })),
    );
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150);
  await fingers.end();
}

/** Click and wait for the page it leads to. */
async function goes(page: Page, pattern: string, action: () => Promise<void>): Promise<void> {
  await Promise.all([page.waitForURL(pattern), action()]);
  await ready(page);
}

const PANEL_FILE = '.world-panel-buttons button:first-child';
const PANEL_MENU = '.world-panel-buttons button:last-child';
const SEED = '.menu-seed input';
const FILE = '.menu input[type=file]';
const ASK_YES = '.menu-actions button.primary';
const ASK_NO = '.menu-actions button:not(.primary)';

try {
  await scenario('Новый мир, перезагрузка, файл, меню', async (page) => {
    await open(page, '');
    check(
      (await page.isVisible('[data-action=continue]')) === false,
      'первый запуск: «Продолжить» нет',
    );
    check(await page.isHidden('.menu-note'), 'первый запуск: заметки нет');

    await page.fill(SEED, 'abc');
    await page.click('[data-action=new]');
    check(await page.isVisible('.menu-error'), 'зерно «abc» — подсказка под полем, мир не начат');
    await page.fill(SEED, '12345');
    check(await page.isHidden('.menu-error'), 'исправленное зерно — подсказка исчезла');
    await goes(page, '**/?scene=world', () => page.press(SEED, 'Enter'));
    const fresh = await world(page);
    check(
      fresh.seed === 12345 && fresh.origin === 'saved' && fresh.savedTick === 0,
      `Enter в поле зерна → мир 12345 из автосохранения, сохранён на тике 0`,
    );

    // Run fast, pause, reload: the same world on the same tick.
    await page.keyboard.press('4');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const before = await world(page);
    const date = await text(page, '.world-panel-date');
    await page.reload();
    await ready(page);
    // After the reload the world runs on at ×1 (the pause is not saved): compare the world as
    // the scene opened it.
    const { opened } = await world(page);
    check(
      before.tick > 200 && opened.tick === before.tick && opened.hash === before.hash,
      `перезагрузка: тот же мир на том же тике (тик ${before.tick}, хэш ${before.hash} → тик ${opened.tick}, хэш ${opened.hash})`,
    );
    // The panel shows the same date (the world runs on after the reload, so not the same tick).
    check(
      (await text(page, '.world-panel-date')) === date,
      `перезагрузка: на панели та же дата (${date})`,
    );

    // Save to file.
    const [download] = await Promise.all([page.waitForEvent('download'), page.click(PANEL_FILE)]);
    const name = download.suggestedFilename();
    const file = join(temp, name);
    await download.saveAs(file);
    const fileTick = Number(/tick-(\d+)\.json$/.exec(name)?.[1]);
    check(
      /^first-campfire-seed-12345-year-1-tick-\d+\.json$/.test(name) &&
        readFileSync(file, 'utf8').startsWith('{"format":"first-campfire/world"'),
      `«Сохранить в файл»: ${name}`,
    );

    // To the menu: «Continue» shows the world.
    await goes(page, '**/?scene=title', () => page.click(PANEL_MENU));
    const card = await text(page, '[data-action=continue]');
    check(/зерно 12345 · тик \d/.test(card), `меню: ${card}`);

    // A new world while one exists: ask first; «Отмена» keeps it.
    await page.fill(SEED, '777');
    await page.click('[data-action=new]');
    check(await page.isVisible('.menu-note-ask'), `вопрос: ${await text(page, '.menu-note')}`);
    await page.click(ASK_NO);
    check(await page.isHidden('.menu-note'), '«Отмена» — вопрос исчез, мир на месте');

    // Bad files: a clear message, nothing erased.
    await page.setInputFiles(FILE, {
      name: 'заметки.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('купить хлеба'),
    });
    await page.waitForSelector('.menu-note-problem');
    check(
      (await text(page, '.menu-note')).includes('Файл «заметки.txt» не открылся'),
      `чужой файл: ${await text(page, '.menu-note-text > div:nth-child(2)')}`,
    );
    await page.setInputFiles(FILE, {
      name: 'обрезанный.json',
      mimeType: 'application/json',
      buffer: Buffer.from(readFileSync(file, 'utf8').slice(0, 500)),
    });
    await page.waitForFunction(
      "document.querySelector('.menu-note').textContent.includes('обрезанный.json')",
    );
    check((await text(page, '.menu-note')).includes('повреждено'), 'обрезанный файл: «повреждено»');

    // Confirm the new world, then load the file back (confirm again).
    await page.click('[data-action=new]');
    await goes(page, '**/?scene=world', () => page.click(ASK_YES));
    check((await world(page)).seed === 777, 'подтвердил — новый мир 777');
    await goes(page, '**/?scene=title', () => page.click(PANEL_MENU));
    await page.setInputFiles(FILE, file);
    await page.waitForSelector('.menu-note-ask');
    check(
      (await text(page, '.menu-note')).includes(`Открыть «${name}»`),
      'вопрос перед загрузкой файла',
    );
    await goes(page, '**/?scene=world', () => page.click(ASK_YES));
    const loaded = await world(page);
    check(
      loaded.seed === 12345 && loaded.opened.tick === fileTick,
      `из файла: мир 12345 на тике ${loaded.opened.tick} (в файле ${fileTick})`,
    );
  });

  await scenario('Испорченное автосохранение', async (page) => {
    await open(page, '?scene=world&slot=broken&seed=7&ticks=9000');
    check(
      (await text(page, '.menu-note')).includes('Сохранённый мир не открылся'),
      `сцена world показывает причину и меню: ${await text(page, '.menu-note-text > div:nth-child(2)')}`,
    );
    await open(page, '?scene=world');
    check(await page.isVisible('.menu-note-problem'), 'и без slot= — слот всё ещё испорчен');
    await page.fill(SEED, '31');
    await goes(page, '**/?scene=world', () => page.click('[data-action=new]'));
    check((await world(page)).seed === 31, '«Начать» без вопроса заменяет испорченное — мир 31');
  });

  await scenario(
    'Браузер не даёт хранилище',
    async (page) => {
      await open(page, '');
      check(
        (await text(page, '.menu-note')).includes('Мир не будет сохраняться сам'),
        'предупреждение в меню',
      );
      await page.fill(SEED, '5');
      await goes(page, '**/?scene=world&seed=5', () => page.click('[data-action=new]'));
      const info = await world(page);
      check(
        info.origin === 'url' && (await text(page, '.world-panel-status')).includes('из адреса'),
        `мир из адреса, панель: ${await text(page, '.world-panel-hint')}`,
      );
    },
    {
      init: () => {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('denied', 'SecurityError');
          },
        });
      },
    },
  );

  // A world near the end of its first year fits into the storage; the save at the new year
  // (the journal grew) does not. The limit lies between the two sizes.
  const fullWorld = createWorld(8);
  runTicks(fullWorld, 4000);
  const fits = saveWorld(fullWorld).length;
  runTicks(fullWorld, 801);
  const limit = Math.floor((fits + saveWorld(fullWorld).length) / 2);
  await scenario(
    'Хранилище переполнено',
    async (page) => {
      await open(page, '?scene=world&slot=world&seed=8&ticks=4000&speed=20');
      await page.waitForFunction('window.__fc.world.tick > 4850', null, { timeout: 30_000 });
      await page.keyboard.press('Space');
      const status = await text(page, '.world-panel-status');
      const info = await world(page);
      check(
        status.includes('переполнено') && info.savedTick === 4000,
        `мир идёт дальше (тик ${info.tick}), панель: ${status}`,
      );
    },
    {
      init: (most: number) => {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
          if (value.length > most) throw new DOMException('full', 'QuotaExceededError');
          setItem.call(this, key, value);
        };
      },
      initArg: limit,
    },
  );

  // The camera (step 1.2): a world of the address, paused, at ×2 in the middle of the map
  // (64×64 tiles = 1024 px; at ×2 the 1280×720 window shows 640×360 of it).
  const CAMERA_WORLD = '?scene=world&seed=7&speed=0&zoom=2&cam=32,32';

  await scenario('Камера: мышь, колесо, клавиши', async (page) => {
    // Without zoom= the world opens at ×2 «улица», the main view (the owner's choice, ADR-022).
    await open(page, '?scene=world&seed=7&speed=0');
    const opening = await camera(page);
    check(
      opening.zoom === 2 && opening.scale === 2,
      `без zoom= мир открывается на ×${opening.zoom} (${opening.scale} пикселя экрана на пиксель мира)`,
    );
    await open(page, CAMERA_WORLD);
    const start = await camera(page);
    check(
      start.zoom === 2 && start.x === 512 && start.y === 512 && start.scale === 2,
      `открылась на ×2 в середине карты (cam=32,32 → ${start.x}, ${start.y})`,
    );

    // Drag: the picture follows the mouse one to one.
    const grabbed = await worldAt(page, 640, 400);
    await mouseDrag(page, { x: 640, y: 400 }, { x: 540, y: 340 });
    const dragged = await camera(page);
    const under = await worldAt(page, 540, 340);
    check(
      dragged.x === 562 && dragged.y === 542 && near(under, grabbed, 0),
      `мышь: тащу на (−100, −60) — камера (${dragged.x}, ${dragged.y}), под курсором та же точка мира ${at(grabbed)} → ${at(under)}`,
    );

    // The wheel: a step closer, gliding (ADR-022); the point under the cursor stays under it in
    // every frame, and the step it comes to is crisp.
    await page.mouse.move(300, 500);
    const point = await worldAt(page, 300, 500);
    const frames = await recordZoom(page, { x: 300, y: 500 }, () => page.mouse.wheel(0, -100));
    const closer = await camera(page);
    const kept = await worldAt(page, 300, 500);
    const between = frames.filter((frame) => frame.scale > 2 && frame.scale < 4);
    const growing = frames.every((frame, i) => i === 0 || frame.scale >= frames[i - 1]!.scale);
    const drift = Math.max(
      ...frames.map((frame) => Math.hypot(frame.point.x - point.x, frame.point.y - point.y)),
    );
    check(
      between.length >= 5 && growing && closer.scale === 4 && !closer.zooming,
      `колесо вверх — плавно: ×2 → ×4 через ${between.length} промежуточных кадров (${between
        .slice(0, 4)
        .map((frame) => frame.scale.toFixed(2))
        .join(', ')}…), в конце ровно ×4`,
    );
    check(
      closer.zoom === 4 && near(kept, point, 0.5) && drift <= 0.5,
      `колесо вверх: ×2 → ×${closer.zoom}, под курсором та же точка мира ${at(point)} → ${at(kept)}, в каждом кадре зума — не дальше ${drift.toFixed(2)} пикселя мира`,
    );
    const panel = await text(page, '.world-panel-camera');
    check(panel.startsWith('масштаб ×4'), `панель «Мир»: ${panel}`);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);
    check(
      (await camera(page)).zoom === 4 && !(await camera(page)).zooming,
      'колесо вверх на ×4 — ближе некуда, остаётся ×4',
    );
    // A throw (at ×4, far from the edges): let go while moving — the picture glides on, slows
    // down and stops by itself.
    await page.mouse.move(560, 400);
    await page.mouse.down();
    await page.mouse.move(640, 400, { steps: 4 });
    await page.mouse.up();
    const thrown = (await camera(page)).x;
    await page.waitForTimeout(150);
    const gliding = (await camera(page)).x;
    await page.waitForTimeout(1500);
    const stopped = (await camera(page)).x;
    await page.waitForTimeout(300);
    const still = (await camera(page)).x;
    check(
      gliding < thrown - 2 && stopped < gliding && still === stopped && stopped > 160,
      `бросок: отпустил на ходу — картинка катится дальше и сама останавливается, не у края (x ${thrown.toFixed(1)} → ${gliding.toFixed(1)} → ${stopped.toFixed(1)} = ${still.toFixed(1)})`,
    );
    const zooms: number[] = [];
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(150);
      await settled(page);
      zooms.push((await camera(page)).zoom);
    }
    const far = await camera(page);
    check(
      zooms.join(' ') === '2 1 0.5 0.5' &&
        far.view.x === 0 &&
        far.view.y === 0 &&
        far.view.width === 1024 &&
        far.view.height === 1024,
      `колесо вниз: ×4 → ×${zooms.join(' → ×')}; на ×0,5 карта видна целиком (${far.view.width}×${far.view.height} в окне 1280×720)`,
    );
    check(
      (await text(page, '.world-panel-camera')).startsWith('масштаб ×0,5'),
      'панель «Мир»: масштаб ×0,5',
    );

    // Keys: WASD / arrows move smoothly, +/− zoom to the middle of the screen.
    await open(page, CAMERA_WORLD);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyD');
    const released = (await camera(page)).x;
    await page.waitForTimeout(1200);
    const right = await camera(page);
    check(
      released > 512 + 50 && right.x > released + 5 && right.x < 704 && right.y === 512,
      `D 0,3 с: камера плавно ушла вправо и после отпускания докатилась (x 512 → ${released.toFixed(1)} → ${right.x.toFixed(1)}), y на месте`,
    );
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(1200);
    const up = await camera(page);
    check(up.y < 512 - 50 && up.x === right.x, `↑: вверх (y 512 → ${up.y.toFixed(1)})`);
    // In and back out inside the map: the middle of the screen stays. (Farther, at ×1 and ×0.5,
    // the map fits across the window and stands in the middle — the edges win.)
    const middle = await worldAt(page, 640, 360);
    const keyZooms: number[] = [];
    const middles: Point[] = [];
    for (const key of ['Equal', 'NumpadSubtract', 'Minus', 'Minus', 'NumpadAdd', 'Equal']) {
      await page.keyboard.press(key);
      await settled(page);
      keyZooms.push((await camera(page)).zoom);
      middles.push(await worldAt(page, 640, 360));
    }
    check(keyZooms.join(' ') === '4 2 1 0.5 1 2', `+ − − − + +: ×2 → ×${keyZooms.join(' → ×')}`);
    check(
      near(middles[0]!, middle, 0.5) && near(middles[1]!, middle, 0.5),
      `зум клавишами — к центру экрана: на ×4 и снова на ×2 в середине та же точка ${at(middle)} → ${at(middles[0]!)} → ${at(middles[1]!)}`,
    );

    // The edges: the view never goes beyond the map.
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(2500);
    await page.keyboard.up('ArrowLeft');
    const left = await camera(page);
    check(
      left.x === 320 && left.offsetX === 0,
      `← 2,5 с: камера упёрлась в левый край (x ${left.x}, карта с ${left.offsetX} пикселя экрана)`,
    );
    for (let i = 0; i < 3; i++) await mouseDrag(page, { x: 100, y: 100 }, { x: 1200, y: 700 });
    const corner = await camera(page);
    check(
      corner.offsetX === 0 && corner.offsetY === 0 && corner.view.x === 0 && corner.view.y === 0,
      `мышью к углу карты: за край не уходит (угол карты в (${corner.offsetX}, ${corner.offsetY}))`,
    );
    for (let i = 0; i < 4; i++) await mouseDrag(page, { x: 1200, y: 700 }, { x: 100, y: 100 });
    const opposite = await camera(page);
    check(
      opposite.offsetX + 2048 === 1280 && opposite.offsetY + 2048 === 720,
      `к противоположному углу: карта кончается ровно у края окна (${opposite.offsetX + 2048}, ${opposite.offsetY + 2048})`,
    );
  });

  await scenario(
    'Камера: пальцы',
    async (page, fingers) => {
      await open(page, CAMERA_WORLD);
      const grabbed = await worldAt(page, 640, 400);
      await touchGesture(page, fingers, [{ x: 640, y: 400 }], [{ x: 560, y: 340 }], 8);
      const dragged = await camera(page);
      const under = await worldAt(page, 560, 340);
      check(
        dragged.x === 552 && dragged.y === 542 && near(under, grabbed, 0),
        `палец тащит карту на (−80, −60): камера (${dragged.x}, ${dragged.y}), под пальцем та же точка ${at(grabbed)} → ${at(under)}`,
      );

      const middle = await worldAt(page, 640, 400);
      await touchGesture(
        page,
        fingers,
        [
          { x: 600, y: 400 },
          { x: 680, y: 400 },
        ],
        [
          { x: 580, y: 400 },
          { x: 700, y: 400 },
        ],
        4,
      );
      await settled(page);
      const spread = await camera(page);
      const kept = await worldAt(page, 640, 400);
      check(
        spread.zoom === 4 && near(kept, middle, 0.5),
        `щипок наружу (80 → 120 пикселей): ×2 → ×${spread.zoom}, между пальцами та же точка мира ${at(middle)} → ${at(kept)}`,
      );
      await touchGesture(
        page,
        fingers,
        [
          { x: 580, y: 400 },
          { x: 700, y: 400 },
        ],
        [
          { x: 608, y: 400 },
          { x: 672, y: 400 },
        ],
        4,
      );
      await settled(page);
      check((await camera(page)).zoom === 2, 'щипок внутрь (120 → 64): ×4 → ×2');
    },
    { touch: true },
  );

  await scenario(
    'Камера: экран 125 % (devicePixelRatio 1,25)',
    async (page) => {
      await open(page, CAMERA_WORLD);
      const start = await camera(page);
      check(
        start.width === 1600 && start.height === 900 && start.pixelRatio === 1.25,
        `холст в физических пикселях: ${start.width}×${start.height} при окне 1280×720`,
      );
      check(
        start.scale === 2,
        `×2 — ровно 2 физических пикселя на пиксель мира (а не 2,5): ${start.scale}`,
      );
      await mouseDrag(page, { x: 640, y: 400 }, { x: 540, y: 400 });
      const moved = await camera(page);
      check(
        moved.x === 512 + 62.5,
        `мышь на 100 CSS-пикселей = 125 физических: камера x 512 → ${moved.x}`,
      );
    },
    { pixelRatio: 1.25 },
  );

  // Step 1.3: villagers walk; with debug=1 a click (a tap without dragging) sends the chosen
  // villager to a tile. Seed 1: the two stand at (28, 27) and (30, 27) by the camp site, the
  // meadow is free at (34, 29) and (26, 29), the lake's water is at (30, 33).
  await scenario('Жители: отладочный щелчок отправляет жителя (debug=1)', async (page) => {
    await open(page, '?scene=world&seed=1&debug=1&speed=0&zoom=2');
    const view = await camera(page);
    /** Where on the page (CSS px) a world point (world px) is drawn. */
    const onPage = (x: number, y: number): Point => ({
      x: (view.offsetX + x * view.scale) / view.pixelRatio,
      y: (view.offsetY + y * view.scale) / view.pixelRatio,
    });
    const tileOnPage = (x: number, y: number) => onPage(x * 16 + 8, y * 16 + 8);
    const people = () => page.evaluate<VillagerState[]>('window.__fc.world.villagers()');
    const note = () => text(page, '.world-panel-debug');
    /** Click and let a frame pass: the panel says what the click did on the next frame. */
    const click = async (point: Point) => {
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(100);
    };

    const [man, woman] = await people();
    check(
      man?.sex === 'male' && woman?.sex === 'female' && man.x === 28 && woman.x === 30,
      `двое у места для стоянки: мужчина (${man?.x}, ${man?.y}), женщина (${woman?.x}, ${woman?.y})`,
    );
    check((await note()).includes('щелчок по жителю'), `панель: ${await note()}`);

    const target = tileOnPage(34, 29);
    await click(target);
    const sent = (await people())[0]!;
    check(
      sent.action === 'walk' && sent.goal?.x === 34 && sent.goal?.y === 29,
      `щелчок по тайлу (34, 29): мужчина идёт туда (${sent.action}, цель ${JSON.stringify(sent.goal)})`,
    );
    check((await note()).includes('идёт к тайлу (34, 29)'), `панель: ${await note()}`);

    const water = tileOnPage(30, 33);
    await click(water);
    const kept = (await people())[0]!;
    check(
      kept.goal?.x === 34 && (await note()).includes('туда нельзя встать'),
      `щелчок по воде (30, 33) — отказ, цель прежняя (${JSON.stringify(kept.goal)}); панель: ${await note()}`,
    );

    const her = onPage(30 * 16 + 8, 27 * 16 + 4);
    await click(her);
    check((await note()).includes('выбрана женщина'), `щелчок по женщине: ${await note()}`);
    const there = tileOnPage(26, 29);
    await click(there);
    const herGoal = (await people())[1]!.goal;
    check(
      herGoal?.x === 26 && herGoal?.y === 29,
      `теперь щелчок отправляет её: цель (${herGoal?.x}, ${herGoal?.y})`,
    );

    // A drag moves the map and sends nobody anywhere.
    const before = await camera(page);
    await mouseDrag(page, { x: 400, y: 300 }, { x: 500, y: 300 });
    const after = await camera(page);
    const goals = (await people()).map((v) => JSON.stringify(v.goal)).join(' ');
    check(
      after.x === before.x - 50 && goals === '{"x":34,"y":29} {"x":26,"y":29}',
      `перетаскивание двигает карту (x ${before.x} → ${after.x}) и никого не отправляет (${goals})`,
    );

    // Unpause (×1): both walk to their tiles.
    await page.keyboard.press('Digit1');
    let arrived = false;
    for (let i = 0; i < 60 && !arrived; i++) {
      await page.waitForTimeout(100);
      const [m, w] = await people();
      arrived = m?.x === 34 && m.y === 29 && w?.x === 26 && w.y === 29;
    }
    const walked = (await people()).map((v) => v.walked.toFixed(1)).join(' и ');
    check(
      arrived,
      `пошли и дошли: мужчина в (34, 29), женщина в (26, 29); пройдено ${walked} тайла`,
    );
  });

  // Step 1.4: needs. With debug=needs the panel tells what each villager is doing and how fed it
  // is; at ×20 the scales fall and the two go to drink and to eat on their own.
  await scenario(
    'Нужды: debug=needs — шкалы и строки панели, жители сами едят и пьют',
    async (page) => {
      await open(page, '?scene=world&seed=1&debug=needs&speed=20&zoom=2');
      const people = () => page.evaluate<VillagerState[]>('window.__fc.world.villagers()');
      const panel = () => text(page, '.world-panel-needs');
      const first = await panel();
      check(
        /мужчина \(житель 1\): .* · сытость \d+ · жажда \d+ · здоровье 100/.test(first) &&
          first.includes('женщина (житель 2)'),
        `панель: ${first}`,
      );
      const seen = new Set<string>();
      let lowest = 100;
      for (let i = 0; i < 80 && !(seen.has('eat') && seen.has('drink')); i++) {
        await page.waitForTimeout(100);
        for (const v of await people()) {
          seen.add(v.action);
          lowest = Math.min(lowest, v.needs.food, v.needs.water);
        }
      }
      const tick = await page.evaluate<number>('window.__fc.world.tick');
      check(
        seen.has('eat') && seen.has('drink'),
        `к тику ${tick} сами пошли есть и пить (действия: ${[...seen].join(', ')}), меньше всего на шкалах — ${lowest.toFixed(0)}`,
      );
      const later = await panel();
      check(
        /ест ягоды|пьёт|идёт к малине|идёт к воде|отдыхает|гуляет/.test(later),
        `панель: ${later}`,
      );
    },
  );
} finally {
  await browser.close();
  server.close();
  rmSync(temp, { recursive: true, force: true });
}

console.log(failed === 0 ? '\nВсе проверки пройдены' : `\n✗ Не пройдено проверок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
