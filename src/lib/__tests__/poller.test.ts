import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted shared state ────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const dbEndpoints: Array<Record<string, unknown>> = [];
  const dbSettings = new Map<string, string>();
  const botCakePages: Array<Record<string, unknown>> = [];
  const convResult = new Map<string, { ts: string | null; count: number }>();
  const toolsResult = new Map<string, string | null>();
  const pancakeShops: Array<Record<string, unknown>> = [];
  const pancakePages: Array<Record<string, unknown>> = [];
  const activePageIds: string[] = [];
  const customerPageIds: string[] = [];
  const pancakeCachedShops: Array<Record<string, unknown>> = [];
  const overrides = new Map<string, { is_active: boolean }>();
  let pancakeShopsFail = false;
  let pancakeOrdersFail = false;
  let pancakeCustomersFail = false;
  let prevRunActiveCount: number | null = null;
  let pancakeActivePageIds = new Set<string>();

  return {
    dbEndpoints, dbSettings, botCakePages, convResult, toolsResult,
    pancakeShops, pancakePages, activePageIds, customerPageIds,
    pancakeCachedShops, overrides,
    pancakeActivePageIds: (v?: string[]) => {
      if (v !== undefined) pancakeActivePageIds = new Set(v);
      return pancakeActivePageIds;
    },
    pancakeShopsFail: () => pancakeShopsFail,
    pancakeOrdersFail: () => pancakeOrdersFail,
    pancakeCustomersFail: () => pancakeCustomersFail,
    prevRunActiveCount: () => prevRunActiveCount,
    setPrevRunActiveCount: (v: number | null) => { prevRunActiveCount = v; },
    setPancakeShopsFail(v: boolean) { pancakeShopsFail = v; },
    setPancakeOrdersFail(v: boolean) { pancakeOrdersFail = v; },
    setPancakeCustomersFail(v: boolean) { pancakeCustomersFail = v; },
    resetAll() {
      dbEndpoints.length = 0;
      dbSettings.clear();
      botCakePages.length = 0;
      convResult.clear();
      toolsResult.clear();
      pancakeShops.length = 0;
      pancakePages.length = 0;
      activePageIds.length = 0;
      customerPageIds.length = 0;
      pancakeCachedShops.length = 0;
      overrides.clear();
      mocks.pancakeActivePageIds([]);
      pancakeShopsFail = false;
      pancakeOrdersFail = false;
      pancakeCustomersFail = false;
      prevRunActiveCount = null;
    },
  };
});

// ── Module mocks ────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

vi.mock('@/lib/sse', () => ({
  broadcastSSE: vi.fn(),
}));

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(() => ({
      startActiveSpan: vi.fn((_name: string, fn: (span: { end: () => void }) => Promise<void>) => {
        const span = { end: vi.fn() };
        return fn(span);
      }),
    })),
  },
}));

vi.mock('@/lib/db', () => ({
  getEndpoint: vi.fn(async (id: string) => {
    const ep = mocks.dbEndpoints.find(e => e.id === id);
    return ep || null;
  }),
  insertSnapshot: vi.fn(async () => ({ inserted: true })),
  getSetting: vi.fn(async (key: string) => mocks.dbSettings.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => { mocks.dbSettings.set(key, value); }),
  listEndpoints: vi.fn(async () => [...mocks.dbEndpoints]),
  getPancakeActivePageIds: vi.fn(async () => new Set(mocks.pancakeActivePageIds())),
  getPreviousRunActiveCount: vi.fn(async () => mocks.prevRunActiveCount()),
  getBotCakeOverrides: vi.fn(async () => new Map(mocks.overrides)),
  isBotCakeEndpoint: vi.fn((ep: Record<string, unknown>) => !!ep.fb_page_id || ep.id === 'botcake-platform' || ((ep.url as string) ?? '').includes('botcake.io')),
  pool: { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() },
}));

vi.mock('@/lib/botcake', () => ({
  fetchBotCakePages: vi.fn(async () => [...mocks.botCakePages]),
  checkBotCakeConversations: vi.fn(async () => new Map(mocks.convResult)),
  checkBotCakeToolsFlows: vi.fn(async () => new Map(mocks.toolsResult)),
}));

vi.mock('@/lib/pancake', () => ({
  fetchPancakeShops: vi.fn(async () => {
    if (mocks.pancakeShopsFail()) throw new Error('API error');
    return [...mocks.pancakeShops];
  }),
  fetchCachedPancakeShops: vi.fn(async () => [...mocks.pancakeCachedShops]),
  fetchPancakePages: vi.fn(async () => [...mocks.pancakePages]),
  fetchPancakeActivePageIds: vi.fn(async () => {
    if (mocks.pancakeOrdersFail()) throw new Error('Orders API error');
    return [...mocks.activePageIds];
  }),
  fetchPancakeActivePageIdsFromCustomers: vi.fn(async () => {
    if (mocks.pancakeCustomersFail()) throw new Error('Customers API error');
    return [...mocks.customerPageIds];
  }),
  mergePagesActivation: vi.fn((shops: unknown[]) => shops),
  TARGET_SHOP_IDS: [430202960],
}));

// ── Tests ───────────────────────────────────────────────────────────

describe('startPoller / stopPoller', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('sets up interval and setTimeout on start, clears on stop', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const mod = await import('@/lib/poller');
    mod.startPoller();
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);

    mod.stopPoller();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('is idempotent — second start does nothing', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    const mod = await import('@/lib/poller');
    mod.startPoller();
    mod.startPoller();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });
});

describe('pollIfNeeded', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('triggers refresh on first call, skips if polled recently', async () => {
    const { setSetting } = await import('@/lib/db');
    const mod = await import('@/lib/poller');

    await mod.pollIfNeeded();
    expect(setSetting).toHaveBeenCalledWith('last_scheduled_run', expect.any(String));

    (setSetting as ReturnType<typeof vi.fn>).mockClear();
    await mod.pollIfNeeded();
    expect(setSetting).not.toHaveBeenCalled();
  });
});

describe('refreshBotCake', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('returns early when endpoint does not exist', async () => {
    const mod = await import('@/lib/poller');
    const { fetchBotCakePages } = await import('@/lib/botcake');
    await mod.refreshBotCake();
    expect(fetchBotCakePages).not.toHaveBeenCalled();
  });

  it('returns early when endpoint has no access_token', async () => {
    mocks.dbEndpoints.push({ id: 'botcake-platform', name: 'BotCake', access_token: null, is_active: true, fb_page_id: '104533988952572' });
    const mod = await import('@/lib/poller');
    const { fetchBotCakePages } = await import('@/lib/botcake');
    await mod.refreshBotCake();
    expect(fetchBotCakePages).not.toHaveBeenCalled();
  });

  it('returns early when API returns 0 pages', async () => {
    mocks.dbEndpoints.push({ id: 'botcake-platform', name: 'BotCake', access_token: 'tok-123', is_active: true, fb_page_id: '104533988952572' });
    const mod = await import('@/lib/poller');
    const { insertSnapshot } = await import('@/lib/db');
    await mod.refreshBotCake();
    expect(insertSnapshot).not.toHaveBeenCalled();
  });

  it('inserts snapshot when API returns data', async () => {
    mocks.dbEndpoints.push({ id: 'botcake-platform', name: 'BotCake', access_token: 'tok-123', is_active: true, fb_page_id: '104533988952572' });
    mocks.botCakePages.push({ page_id: 'p1', name: 'Page 1' }, { page_id: 'p2', name: 'Page 2' });
    const mod = await import('@/lib/poller');
    const { insertSnapshot, setSetting } = await import('@/lib/db');
    await mod.refreshBotCake();
    expect(insertSnapshot).toHaveBeenCalledTimes(1);
    expect(setSetting).toHaveBeenCalledWith('poller_ok_botcake-platform', expect.any(String));
  });

  it('classifies pancake-active pages as active', async () => {
    mocks.dbEndpoints.push({ id: 'botcake-platform', name: 'BotCake', access_token: 'tok-123', is_active: true, fb_page_id: '104533988952572' });
    mocks.botCakePages.push({ page_id: 'p1', name: 'Page 1' });
    mocks.pancakeActivePageIds(['p1']);
    const mod = await import('@/lib/poller');
    const { insertSnapshot } = await import('@/lib/db');
    await mod.refreshBotCake();
    const call = (insertSnapshot as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.active_pages).toHaveLength(1);
    expect(call.active_pages[0].activation_reason).toBe('pancake-activity');
  });

  it('classifies conversation pages as active', async () => {
    mocks.dbEndpoints.push({ id: 'botcake-platform', name: 'BotCake', access_token: 'tok-123', is_active: true, fb_page_id: '104533988952572' });
    mocks.botCakePages.push({ page_id: 'p1', name: 'Page 1' });
    mocks.convResult.set('p1', { ts: '2026-01-01T00:00:00Z', count: 5 });
    const mod = await import('@/lib/poller');
    const { insertSnapshot } = await import('@/lib/db');
    await mod.refreshBotCake();
    const call = (insertSnapshot as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.active_pages).toHaveLength(1);
    expect(call.active_pages[0].activation_reason).toBe('has-conversations');
  });

  it('classifies tools/flows pages as active', async () => {
    mocks.dbEndpoints.push({ id: 'botcake-platform', name: 'BotCake', access_token: 'tok-123', is_active: true, fb_page_id: '104533988952572' });
    mocks.botCakePages.push({ page_id: 'p1', name: 'Page 1' });
    mocks.toolsResult.set('p1', '2026-01-01T00:00:00Z');
    const mod = await import('@/lib/poller');
    const { insertSnapshot } = await import('@/lib/db');
    await mod.refreshBotCake();
    const call = (insertSnapshot as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.active_pages).toHaveLength(1);
    expect(call.active_pages[0].activation_reason).toBe('has-tools');
  });

  it('applies manual overrides: active→inactive', async () => {
    mocks.dbEndpoints.push({ id: 'botcake-platform', name: 'BotCake', access_token: 'tok-123', is_active: true, fb_page_id: '104533988952572' });
    mocks.botCakePages.push({ page_id: 'p1', name: 'Page 1' });
    mocks.pancakeActivePageIds(['p1']);
    mocks.overrides.set('p1', { is_active: false });
    const mod = await import('@/lib/poller');
    const { insertSnapshot } = await import('@/lib/db');
    await mod.refreshBotCake();
    const call = (insertSnapshot as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.active_pages).toHaveLength(0);
    expect(call.inactive_pages).toHaveLength(1);
    expect(call.inactive_pages[0].activation_reason).toBe('manual-override');
  });

  it('detects alert when active pages drop significantly', async () => {
    mocks.dbEndpoints.push({ id: 'botcake-platform', name: 'BotCake', access_token: 'tok-123', is_active: true, fb_page_id: '104533988952572' });
    mocks.botCakePages.push({ page_id: 'p1', name: 'Page 1' });
    mocks.pancakeActivePageIds(['p1']);
    mocks.setPrevRunActiveCount(10);
    const mod = await import('@/lib/poller');
    const { insertSnapshot } = await import('@/lib/db');
    await mod.refreshBotCake();
    const call = (insertSnapshot as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.outage_suspected).toBe(true);
    expect(call.alert_count).toBeGreaterThan(0);
  });

  it('does not alert when active pages are stable', async () => {
    mocks.dbEndpoints.push({ id: 'botcake-platform', name: 'BotCake', access_token: 'tok-123', is_active: true, fb_page_id: '104533988952572' });
    mocks.botCakePages.push({ page_id: 'p1', name: 'Page 1' });
    mocks.pancakeActivePageIds(['p1']);
    mocks.setPrevRunActiveCount(1);
    const mod = await import('@/lib/poller');
    const { insertSnapshot } = await import('@/lib/db');
    await mod.refreshBotCake();
    const call = (insertSnapshot as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.outage_suspected).toBe(false);
    expect(call.alert_count).toBe(0);
  });
});

describe('refreshAll', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('calls botcake and pancake refreshes, broadcasts, updates settings', async () => {
    const mod = await import('@/lib/poller');
    await mod.refreshAll();
    const { broadcastSSE } = await import('@/lib/sse');
    const { setSetting } = await import('@/lib/db');
    expect(broadcastSSE).toHaveBeenCalledWith('refresh', expect.any(String));
    expect(setSetting).toHaveBeenCalledWith('last_scheduled_run', expect.any(String));
  });
});

describe('refreshPancake (via refreshAll)', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('returns early when no active pancake endpoints exist', async () => {
    const mod = await import('@/lib/poller');
    const { fetchPancakeShops } = await import('@/lib/pancake');
    await mod.refreshAll();
    expect(fetchPancakeShops).not.toHaveBeenCalled();
  });

  it('processes pancake endpoints and inserts snapshots', async () => {
    mocks.dbEndpoints.push(
      { id: 'botcake-platform', name: 'BotCake', access_token: 'tok-123', is_active: true, fb_page_id: '104533988952572' },
      { id: '430202960', name: 'Shop 1', access_token: 'tok-abc', url: 'https://example.com', is_active: true },
    );
    mocks.pancakeShops.push({
      id: 430202960, name: 'Shop 1', pages: [
        { id: 'p1', name: 'Page 1', is_activated: true },
      ],
    });
    const mod = await import('@/lib/poller');
    const { fetchPancakeShops } = await import('@/lib/pancake');
    const { insertSnapshot } = await import('@/lib/db');
    await mod.refreshAll();
    expect(fetchPancakeShops).toHaveBeenCalled();
    expect(insertSnapshot).toHaveBeenCalledTimes(1);
    const pancakeCall = (insertSnapshot as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pancakeCall.endpoint_id).toBe('430202960');
    expect(pancakeCall.active_pages).toHaveLength(1);
  });

  it('falls back to cached shops when live API fails', async () => {
    mocks.dbEndpoints.push(
      { id: 'botcake-platform', name: 'BotCake', access_token: 'tok-123', is_active: true, fb_page_id: '104533988952572' },
      { id: '430202960', name: 'Shop 1', access_token: 'tok-abc', url: 'https://example.com', is_active: true },
    );
    mocks.setPancakeShopsFail(true);
    mocks.pancakeCachedShops.push({
      id: 430202960, name: 'Shop 1 (cached)', pages: [
        { id: 'p1', name: 'Page 1', is_activated: false },
      ],
    });
    const mod = await import('@/lib/poller');
    const { fetchCachedPancakeShops } = await import('@/lib/pancake');
    const { insertSnapshot } = await import('@/lib/db');
    await mod.refreshAll();
    expect(fetchCachedPancakeShops).toHaveBeenCalled();
    expect(insertSnapshot).toHaveBeenCalledTimes(1);
    const pancakeCall = (insertSnapshot as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pancakeCall.inactive_pages).toHaveLength(1);
  });
});
