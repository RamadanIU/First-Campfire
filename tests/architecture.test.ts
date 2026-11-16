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
});
