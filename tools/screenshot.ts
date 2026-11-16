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
 *
 * Playwright and Chromium are preinstalled in Claude Code cloud sessions and are
 * deliberately NOT in package.json (a second copy would not find the browser).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIST = join(ROOT, 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
};

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

const outDir = values.out
  ? join(ROOT, values.out)
  : join(ROOT, 'docs', 'screenshots', values.step!);

if (!values['no-build']) {
  console.log('Сборка…');
  execFileSync('npm', ['run', 'build', '--silent'], { cwd: ROOT, stdio: 'inherit' });
}
if (!existsSync(join(DIST, 'index.html'))) fail('Нет dist/index.html — сборка не выполнена');

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const file = normalize(join(DIST, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(DIST) || !existsSync(file)) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  response.end(readFileSync(file));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// Resolved through NODE_PATH, hence require() rather than import.
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
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
    errors.push(...((await page.evaluate('window.__fc ? window.__fc.errors : []')) as string[]));

    const file = join(outDir, `${String(index + 1).padStart(2, '0')}-${shot.name}.png`);
    await page.screenshot({ path: file });
    await context.close();

    if (errors.length > 0) {
      failures.push(...errors.map((error) => `${shot.name}: ${error}`));
      console.error(`✗ ${relative(ROOT, file)} — снят, но на странице есть ошибки`);
    } else {
      console.log(`✓ ${relative(ROOT, file)}  ←  ${shot.query || '(без параметров)'}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error('\nОшибки на странице:');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
