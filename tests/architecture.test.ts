/**
 * Architecture guard. The simulation (src/sim, src/data) must stay deterministic and
 * independent from the browser: one seed — one history, and the same code runs
 * headless in Node for batch runs. These rules are checked on every test run so a
 * violation cannot slip in unnoticed. See docs/ARCHITECTURE.md.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PURE_DIRS = ['src/sim', 'src/data'];

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bMath\.random\b/, why: 'случайность только через ГСЧ симуляции (зерно)' },
  {
    pattern: /\bDate\.now\b|\bnew Date\b/,
    why: 'время симуляции — это тики, а не часы компьютера',
  },
  { pattern: /\bperformance\.now\b/, why: 'время симуляции — это тики, а не часы компьютера' },
  {
    pattern:
      /\bMath\.(?:a?sinh?|a?cosh?|a?tanh?|atan2|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b/,
    why: 'результат различается между браузерами — используй src/sim/math.ts',
  },
  {
    pattern: /\*\*/,
    why: 'возведение в степень неточно и различается между браузерами — умножай явно',
  },
  { pattern: /\b(window|document|navigator|localStorage)\b/, why: 'симуляция не знает о браузере' },
  {
    pattern: /\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b/,
    why: 'никаких таймеров в симуляции',
  },
  {
    pattern: /from\s+['"][^'"]*\/(render|ui|app|art)\//,
    why: 'симуляция не зависит от отрисовки и интерфейса',
  },
  { pattern: /from\s+['"]node:/, why: 'симуляция не зависит от Node — она работает и в браузере' },
];

/**
 * Graphics as code (src/art) depends only on itself: sprite descriptions, palette, rasterizer
 * and atlas are pure functions that run in Node tests and in the browser alike. Drawing on a
 * canvas belongs to src/render.
 */
const ART_FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bMath\.random\b/, why: 'спрайт одинаков при каждом запуске' },
  {
    pattern: /\bDate\.now\b|\bnew Date\b|\bperformance\.now\b/,
    why: 'спрайт не зависит от часов',
  },
  {
    pattern: /\b(window|document|navigator|localStorage)\b/,
    why: 'src/art работает и без браузера (тесты в Node); холст — дело src/render',
  },
  {
    pattern: /\b(HTMLCanvasElement|CanvasRenderingContext2D|OffscreenCanvas|ImageData)\b/,
    why: 'src/art работает и без браузера; холст — дело src/render',
  },
  {
    pattern: /from\s+['"][^'"]*\/(sim|data|render|ui|app)\//,
    why: 'src/art зависит только от себя (направление: app → render → art)',
  },
  { pattern: /from\s+['"]node:/, why: 'src/art работает и в браузере' },
];

function listSources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSources(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

/** Drop comments so that prose mentioning a forbidden name does not trip the guard. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('архитектурные правила', () => {
  it('симуляция детерминирована и не зависит от браузера и отрисовки', () => {
    const violations: string[] = [];
    for (const dir of PURE_DIRS) {
      for (const file of listSources(join(ROOT, dir))) {
        const source = stripComments(readFileSync(file, 'utf8'));
        for (const { pattern, why } of FORBIDDEN) {
          const match = pattern.exec(source);
          if (match) violations.push(`${relative(ROOT, file)}: «${match[0]}» — ${why}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('графика как код (src/art) — чистые функции, без браузера и чужих модулей', () => {
    const violations: string[] = [];
    for (const file of listSources(join(ROOT, 'src/art'))) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const { pattern, why } of ART_FORBIDDEN) {
        const match = pattern.exec(source);
        if (match) violations.push(`${relative(ROOT, file)}: «${match[0]}» — ${why}`);
      }
    }
    expect(violations).toEqual([]);
    for (const bad of [
      "document.createElement('canvas')",
      'new ImageData(pixels, 1, 1)',
      "import { World } from '../sim/world.ts'",
      "import { draw } from '../render/spriteSheet.ts'",
    ]) {
      expect(
        ART_FORBIDDEN.some(({ pattern }) => pattern.test(bad)),
        bad,
      ).toBe(true);
    }
  });

  it('правила ловят нарушения и не мешают разрешённому', () => {
    const caught = (source: string) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(stripComments(source)));
    for (const bad of [
      'Math.random()',
      'Date.now()',
      'Math.sin(a)',
      'Math.atan2(y, x)',
      'Math.log(x)',
      'Math.pow(2, 3)',
      'x ** 2',
      "import { draw } from '../render/draw.ts'",
    ]) {
      expect(caught(bad), bad).toBe(true);
    }
    for (const good of [
      'Math.sqrt(x)',
      'Math.floor(x)',
      'Math.imul(a, b)',
      'Math.max(a, b)',
      '/** Math.log is not allowed here */',
      '// x ** 2 in a comment',
    ]) {
      expect(caught(good), good).toBe(false);
    }
  });
});
