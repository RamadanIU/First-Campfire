/**
 * End-to-end check in a real browser (step 0.7): the menu, a new world, a page reload, saving to
 * a file and loading it back, bad saves and files, blocked and full browser storage. Every check
 * prints ✓ or ✗; the exit code is 1 if any failed — or if a page reported an error.
 *
 *   npm run e2e                 build the game, then run every scenario (≈ 30 s)
 *   npm run e2e -- --no-build   reuse dist/
 *
 * Not part of `npm run check` (it needs Chromium and takes time): run it when the menu, the
 * world scene or saves change, and at stage reviews. The world is read from `window.__fc.world`
 * (src/main.ts), not from the screen, so a new look of the world scene does not break it.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
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
  keyboard: { press(key: string): Promise<void> };
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

/** A fresh browser (empty storage); `init` runs in every page before the game. */
async function scenario(
  title: string,
  run: (page: Page) => Promise<void>,
  init?: () => void,
): Promise<void> {
  console.log(`\n${title}`);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
  });
  if (init) await context.addInitScript(init);
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await run(page);
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
    '(({ seed, tick, hash, origin, savedTick }) => ({ seed, tick, hash: hash(), origin, savedTick }))(window.__fc.world)',
  );
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
    const journal = await text(page, '.journal-list');
    await page.reload();
    await ready(page);
    const after = await world(page);
    check(
      before.tick > 200 && after.tick === before.tick && after.hash === before.hash,
      `перезагрузка: тот же мир на том же тике (тик ${before.tick}, хэш ${before.hash} → тик ${after.tick}, хэш ${after.hash})`,
    );
    check((await text(page, '.journal-list')) === journal, 'перезагрузка: журнал тот же');

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
      loaded.seed === 12345 && loaded.tick === fileTick,
      `из файла: мир 12345 на тике ${loaded.tick} (в файле ${fileTick})`,
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
    () => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    },
  );

  await scenario(
    'Хранилище переполнено',
    async (page) => {
      // A world near the end of its first year (save ≈ 7 000 characters); the save at the new
      // year (≈ 8 400) does not fit into a storage of 7 500.
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
    () => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (value.length > 7_500) throw new DOMException('full', 'QuotaExceededError');
        setItem.call(this, key, value);
      };
    },
  );
} finally {
  await browser.close();
  server.close();
  rmSync(temp, { recursive: true, force: true });
}

console.log(failed === 0 ? '\nВсе проверки пройдены' : `\n✗ Не пройдено проверок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
