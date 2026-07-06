import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listPrizes } from '../../db/adminRepository';
import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { ensureDemoSeed, isDemoSeedEnabled } from './displayBootstrap';

describe('ensureDemoSeed production gating', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-seed-gate-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.delete();
  });

  it('does NOT seed when VITE_ENABLE_DEMO_SEED is explicitly false (production behavior)', async () => {
    vi.stubEnv('VITE_ENABLE_DEMO_SEED', 'false');

    await ensureDemoSeed(db);

    await expect(listPrizes(db)).resolves.toHaveLength(0);
    await expect(db.events.count()).resolves.toBe(0);
  });

  it('seeds in dev/test when the flag is unset', async () => {
    // Default Vitest environment: DEV=true, flag unset → seeding enabled.
    await ensureDemoSeed(db);

    await expect(db.events.count()).resolves.toBeGreaterThan(0);
    await expect(listPrizes(db)).resolves.not.toHaveLength(0);
  });

  it('isDemoSeedEnabled respects explicit flags', () => {
    vi.stubEnv('VITE_ENABLE_DEMO_SEED', 'true');
    expect(isDemoSeedEnabled()).toBe(true);

    vi.stubEnv('VITE_ENABLE_DEMO_SEED', 'false');
    expect(isDemoSeedEnabled()).toBe(false);
  });
});
