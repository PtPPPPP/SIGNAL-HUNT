import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    // Build-time constant sourced from package.json so /diagnostics always shows
    // the真实 shipped version without hand-syncing.
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  server: {
    watch: {
      // Ignore build/packaging output so a running packaged Electron app — which
      // locks `out/SIGNAL HUNT-*/SIGNAL HUNT.exe` — doesn't crash the dev watcher
      // with EBUSY. node_modules/.git must be re-listed since this overrides the
      // default ignored set.
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/out/**',
        '**/release/**',
        '**/test-results/**',
      ],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    // Stress and burn-in suites are invoked explicitly via `npm run test:stress`
    // and `npm run burnin:short`; keeping them out of the default `npm test` run
    // keeps the unit suite fast and deterministic.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/e2e/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      'src/stress/**',
      'src/burn-in/**',
      'src/perf/**',
    ],
  },
});
