/// <reference types="vite/client" />

/**
 * Injected at build time from package.json (see vite.config.ts `define`).
 * Used by /diagnostics to report the真实 shipped app version.
 */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /**
   * Explicitly toggle demo seed creation.
   * - 'true'  → ensureDemoSeed may create the demo event/prizes (even in a prod build).
   * - 'false' → demo seed is disabled (even in dev/test), use this to exercise the
   *             empty-database "no event configured" path.
   * - unset   → defaults to dev/test on, production off.
   */
  readonly VITE_ENABLE_DEMO_SEED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
