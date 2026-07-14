import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

/**
 * Dedicated config for the performance benchmark suite. Like the reliability
 * config, this is excluded from the default `npm test` run and invoked explicitly
 * via `npm run test:perf`. It seeds large record sets and logs elapsed
 * milliseconds; it deliberately does NOT impose fragile hard time gates — the
 * point is to observe complexity / catch regressions, not to assert absolute ms.
 */
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    include: ['src/perf/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
