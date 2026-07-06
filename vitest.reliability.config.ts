import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

/**
 * Dedicated config for the reliability suites (stress + burn-in). Unlike the base
 * vite.config.ts, this does NOT exclude `src/stress` / `src/burn-in`, so the
 * dedicated `npm run test:stress` and `npm run burnin:short` scripts can target
 * them explicitly via positional filters. Kept separate so the normal `npm test`
 * unit suite stays fast.
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
    include: ['src/stress/**/*.{test,spec}.?(c|m)[jt]s?(x)', 'src/burn-in/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
