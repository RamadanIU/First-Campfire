/**
 * The built game in a real browser — shared by the screenshot tool (./screenshot.ts) and the
 * end-to-end check (./e2e.ts): build `dist/`, serve it on a free local port, launch Chromium.
 *
 * Playwright and Chromium are preinstalled in Claude Code cloud sessions and are deliberately
 * NOT in package.json (a second copy would not find the browser).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
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

/** `npm run build`; throws if the build fails or leaves no dist/index.html. */
export function buildGame(): void {
  execFileSync('npm', ['run', 'build', '--silent'], { cwd: ROOT, stdio: 'inherit' });
  if (!existsSync(join(DIST, 'index.html')))
    throw new Error('Нет dist/index.html — сборка не выполнена');
}

export function hasBuild(): boolean {
  return existsSync(join(DIST, 'index.html'));
}

/** Serve dist/ on 127.0.0.1 at a free port. */
export async function serveGame(): Promise<{ origin: string; close: () => void }> {
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
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => server.close(),
  };
}

/** Playwright's Chromium, resolved through NODE_PATH (hence require() rather than import). */
export function chromium() {
  return createRequire(import.meta.url)('playwright').chromium;
}
