/**
 * Screenshot tool: builds the game, opens it in headless Chromium and saves PNGs.
 * A shot FAILS if the page reports any error — so a screenshot is also a smoke test.
 *
 *   npm run shot -- --step 1.3 berries="?scene=world&seed=7&ticks=4000" night="?scene=world&ticks=9000"
 *
 * Each positional argument is `name=query`: the file name and the URL query that
 * reproduces the picture. Files go to docs/screenshots/<step>/NN-name.png.
 * A shot can have its own window size: `phone@390x844="?scene=title"`.
 *
 * Options:
 *   --step <id>      roadmap step id; sets the output folder docs/screenshots/<id>/
 *   --out <dir>      output folder instead of --step (for scratch shots, e.g. out/shots)
 *   --width <px>     viewport width  (default 1280)
 *   --height <px>    viewport height (default 720)
 *   --scale <n>      device pixel ratio (default 1; pixel art does not need more)
 *   --wait <ms>      extra wait after the page is ready (default 0)
 *   --no-build       reuse the existing dist/ instead of rebuilding
 *   --check-crisp <n>  every shot must be crisp pixel art at ×n: each n×n square of one colour
 *                    (use with `ui=0` — text is not pixel art); a blurred shot fails the command.
 *                    n counts pixels of the PNG: with --scale 2 a picture at zoom ×2 is ×4
 *   --check-half <dir>  every shot is a picture at ×0.5 (`zoom=0.5`): each of its pixels must be
 *                    every second pixel of the shot of the same name in <dir> — the same place at
 *                    ×1 (`zoom=1`, the same `cam=`) in a window twice as large; smoothing mixes
 *                    neighbours and fails the command
 *   --compare <dir>  compare every shot with the shot of the same name in <dir> (the NN- prefix
 *                    is ignored), e.g. the previous step's folder: «pixel for pixel» or where
 *                    they differ. Differences are reported, not failed — judge them by eye
 *   --frame-time <ms>  let the live page (no `frame=` in the query) run for <ms> before the shot
 *                    and report how long drawing a frame took: average, 99 % of frames, the worst
 *                    and, apart, the first one (`window.__fc.renderMs`, filled by src/main.ts)
 *
 * Playwright and Chromium are preinstalled in Claude Code cloud sessions and are
 * deliberately NOT in package.json (a second copy would not find the browser).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { buildGame, chromium, hasBuild, ROOT, serveGame } from './browser.ts';
import { compareImages, crispness, halfOf } from './imageChecks.ts';
import { decodePng } from './png.ts';

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    step: { type: 'string' },
    out: { type: 'string' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '720' },
    scale: { type: 'string', default: '1' },
    wait: { type: 'string', default: '0' },
    'no-build': { type: 'boolean', default: false },
    'check-crisp': { type: 'string' },
    'check-half': { type: 'string' },
    compare: { type: 'string' },
    'frame-time': { type: 'string' },
  },
});

if (positionals.length === 0)
  fail('Не задано ни одного кадра. Пример: title="?scene=title&frame=12"');
if (!values.step && !values.out) fail('Укажите --step <id> или --out <папка>');
if (values.step && !/^\d+\.\d+[a-z]?$/.test(values.step))
  fail(`Некорректный id шага: ${values.step}`);

const shots = positionals.map((argument) => {
  const separator = argument.indexOf('=');
  if (separator < 1) fail(`Кадр должен иметь вид имя=запрос, получено: ${argument}`);
  const match = /^([a-z0-9-]+)(?:@(\d+)x(\d+))?$/.exec(argument.slice(0, separator));
  if (!match) fail(`Имя кадра — латиница, цифры и дефис, можно с размером @390x844: ${argument}`);
  const query = argument.slice(separator + 1);
  return {
    name: match[1]!,
    width: Number(match[2] ?? values.width),
    height: Number(match[3] ?? values.height),
    query: query.startsWith('?') || query === '' ? query : `?${query}`,
  };
});

const crispScale = values['check-crisp'] === undefined ? null : Number(values['check-crisp']);
if (crispScale !== null && !(Number.isInteger(crispScale) && crispScale >= 2))
  fail(`--check-crisp: масштаб — целое число от 2, получено ${values['check-crisp']}`);
const compareDir = values.compare === undefined ? null : join(ROOT, values.compare);
const halfDir = values['check-half'] === undefined ? null : join(ROOT, values['check-half']);
if (halfDir !== null && !existsSync(halfDir))
  fail(`--check-half: нет папки ${values['check-half']}`);
const frameTimeMs = values['frame-time'] === undefined ? null : Number(values['frame-time']);
if (frameTimeMs !== null && !(Number.isInteger(frameTimeMs) && frameTimeMs >= 100))
  fail(
    `--frame-time: сколько миллисекунд смотреть — целое от 100, получено ${values['frame-time']}`,
  );
if (compareDir !== null && !existsSync(compareDir)) fail(`--compare: нет папки ${values.compare}`);

/** The shot named `name` in folder `dir`: NN-name.png with any NN. */
function shotIn(dir: string, name: string): string | null {
  const file = readdirSync(dir).find((entry) => entry.replace(/^\d+-/, '') === `${name}.png`);
  return file === undefined ? null : join(dir, file);
}

const fmt = (value: number) => value.toLocaleString('ru-RU');
const comparisons: string[] = [];

const outDir = values.out
  ? join(ROOT, values.out)
  : join(ROOT, 'docs', 'screenshots', values.step!);

if (!values['no-build']) {
  console.log('Сборка…');
  buildGame();
}
if (!hasBuild()) fail('Нет dist/index.html — сборка не выполнена');

const server = await serveGame();
const { origin } = server;
const browser = await chromium().launch();
const failures: string[] = [];
mkdirSync(outDir, { recursive: true });

try {
  for (const [index, shot] of shots.entries()) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: Number(values.scale),
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message: { type(): string; text(): string }) => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
    });
    page.on('requestfailed', (request: { url(): string }) => {
      errors.push(`не загрузилось: ${request.url()}`);
    });

    await page.goto(`${origin}/${shot.query}`);
    try {
      await page.waitForFunction('window.__fc && window.__fc.ready === true', null, {
        timeout: 60_000,
      });
    } catch {
      errors.push('страница не сообщила о готовности за 60 с (window.__fc.ready)');
    }
    if (Number(values.wait) > 0) await page.waitForTimeout(Number(values.wait));
    const timing: string[] = [];
    if (frameTimeMs !== null) {
      await page.waitForTimeout(frameTimeMs);
      const { drawn, first } = (await page.evaluate(
        '({ drawn: window.__fc ? window.__fc.renderMs : [], first: window.__fc ? window.__fc.firstRenderMs : null })',
      )) as { drawn: number[]; first: number | null };
      if (drawn.length === 0 || first === null) {
        errors.push('--frame-time: живых кадров нет (в адресе есть frame=?)');
      } else {
        // The first frame pays for setting up (canvases reach the graphics card): apart.
        const times = drawn.slice().sort((a, b) => a - b);
        const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
        const p99 = times[Math.min(times.length - 1, Math.floor(times.length * 0.99))]!;
        const ms = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
        timing.push(
          `  кадр рисуется: в среднем ${ms(mean)} мс, 99 % — не дольше ${ms(p99)} мс, худший ${ms(times.at(-1)!)} мс (${times.length} кадров; первый — ${ms(first)} мс)`,
        );
      }
    }
    errors.push(...((await page.evaluate('window.__fc ? window.__fc.errors : []')) as string[]));

    const file = join(outDir, `${String(index + 1).padStart(2, '0')}-${shot.name}.png`);
    const png: Buffer = await page.screenshot({ path: file });
    await context.close();
    const notes: string[] = [...timing];

    if (crispScale !== null) {
      const report = crispness(decodePng(png), crispScale);
      if (report.mixed > 0)
        errors.push(
          `не резкий ×${crispScale}: ${fmt(report.mixed)} из ${fmt(report.blocks)} квадратов ${crispScale}×${crispScale} не одноцветны, первый — у (${report.firstMixed!.x}, ${report.firstMixed!.y}) (интерфейс скрыт параметром ui=0?)`,
        );
      else
        notes.push(
          `  резкий ×${crispScale}: все ${fmt(report.blocks)} квадратов ${crispScale}×${crispScale} одноцветны (сетка от ${report.shiftX}, ${report.shiftY})`,
        );
    }
    if (halfDir !== null) {
      const full = shotIn(halfDir, shot.name);
      if (full === null) {
        errors.push(`--check-half: в ${values['check-half']} нет кадра «${shot.name}» (×1)`);
      } else {
        const small = decodePng(png);
        const report = halfOf(small, decodePng(readFileSync(full)));
        const against = relative(ROOT, full);
        const all = small.width * small.height;
        if (report.compared < all * 0.9)
          errors.push(
            `--check-half: с ${against} удалось сравнить только ${fmt(report.compared)} из ${fmt(all)} пикселей — кадр ×1 должен быть снят в окне вдвое больше (с тем же --scale)`,
          );
        else if (report.mismatched > 0)
          errors.push(
            `не «каждый второй пиксель» ${against}: не совпали ${fmt(report.mismatched)} из ${fmt(report.compared)} пикселей${report.firstMismatch ? `, первый — у (${report.firstMismatch.x}, ${report.firstMismatch.y})` : ''} (кадр ×1 снят в окне вдвое больше, с тем же cam=?)`,
          );
        else
          notes.push(
            `  ×0,5 без сглаживания: все ${fmt(report.compared)} пикселей — пиксели ${against} через один (от ${report.shiftX}, ${report.shiftY})`,
          );
      }
    }
    if (compareDir !== null) {
      const previous = shotIn(compareDir, shot.name);
      if (previous === null) {
        comparisons.push(`  ? ${shot.name}: в ${values.compare} нет кадра с таким именем`);
      } else {
        const difference = compareImages(decodePng(png), decodePng(readFileSync(previous)));
        const against = relative(ROOT, previous);
        if (!difference.sameSize)
          comparisons.push(`  ≠ ${shot.name}: другой размер, чем ${against}`);
        else if (difference.differing === 0)
          comparisons.push(`  = ${shot.name}: пиксель в пиксель как ${against}`);
        else {
          const box = difference.box!;
          comparisons.push(
            `  ≠ ${shot.name}: отличаются ${fmt(difference.differing)} пикселей от ${against} — в прямоугольнике x ${box.x}…${box.x + box.width - 1}, y ${box.y}…${box.y + box.height - 1}`,
          );
        }
      }
    }

    if (errors.length > 0) {
      failures.push(...errors.map((error) => `${shot.name}: ${error}`));
      console.error(
        `✗ ${relative(ROOT, file)} — снят, но есть ошибки (на странице или в проверке кадра)`,
      );
    } else {
      console.log(`✓ ${relative(ROOT, file)}  ←  ${shot.query || '(без параметров)'}`);
    }
    for (const note of notes) console.log(note);
  }
} finally {
  await browser.close();
  server.close();
}

if (comparisons.length > 0) {
  console.log(`\nСравнение с ${values.compare} (отличия — повод посмотреть глазами, а не ошибка):`);
  for (const line of comparisons) console.log(line);
}

if (failures.length > 0) {
  console.error('\nОшибки:');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
