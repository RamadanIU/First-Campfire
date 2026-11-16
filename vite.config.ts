import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// base: './' — сборка работает из любой папки (локальный файл-сервер, скриншотер).
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
