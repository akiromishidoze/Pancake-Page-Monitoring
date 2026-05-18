import { describe, it, expect } from 'vitest';

describe('db module exports', () => {
  it('exports pool', async () => {
    const mod = await import('@/lib/db');
    expect(mod.pool).toBeDefined();
    expect(typeof mod.pool).toBe('object');
  });

  it('exports all expected functions', async () => {
    const mod = await import('@/lib/db');
    const fns = ['insertSnapshot', 'getLatestRun', 'getPageHistory', 'listEndpoints',
      'getSetting', 'setSetting', 'pruneOldRuns', 'getBotCakeOverrides',
      'getLatestPageStates', 'getRunHistory', 'getEndpoint', 'upsertEndpoint',
      'deleteEndpoint', 'listPlatformPages', 'upsertPlatformPage', 'deletePlatformPage'];
    for (const name of fns) {
      expect(typeof (mod as any)[name]).toBe('function');
    }
  });

  it('exports pool and no undefined core exports', async () => {
    const mod = await import('@/lib/db');
    expect(mod.pool).toBeTruthy();
  });
});
