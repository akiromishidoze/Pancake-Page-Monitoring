// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockClient = {
  query: vi.fn<any>(async () => ({ rows: [] })),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn<any>(async () => mockClient),
  query: vi.fn<any>(async () => ({ rows: [] })),
  on: vi.fn(),
  end: vi.fn(),
};

vi.mock('pg', () => {
  return {
    Pool: class {
      connect = mockPool.connect;
      query = mockPool.query;
      on = mockPool.on;
      end = mockPool.end;
    }
  };
});

vi.mock('pg-connection-string', () => ({
  parse: vi.fn(() => ({ host: 'localhost', port: '5432' })),
}));

const defaultQuery = async (sql: any) => {
  if (typeof sql === 'string') {
    if (sql.includes('AS cnt')) return { rows: [{ cnt: 0 }] };
    if (sql.includes("relkind = 'p'")) return { rows: [{ relkind: 'p' }] };
  }
  return { rows: [] };
};

describe('db module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPool.query.mockImplementation(defaultQuery);
    mockClient.query.mockImplementation(async () => ({ rows: [] }));
  });

  describe('settings', () => {
    it('getSetting returns value', async () => {
      mockPool.query.mockImplementation(async (sql: any) => {
        if (typeof sql === 'string' && sql.includes('SELECT value FROM settings')) {
          return { rows: [{ value: 'test_val' }] };
        }
        return defaultQuery(sql);
      });
      
      const { getSetting } = await import('../db');
      const val = await getSetting('test_key');
      
      expect(val).toBe('test_val');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT value FROM settings WHERE key = $1'),
        ['test_key']
      );
    });

    it('getSetting returns null if not found', async () => {
      const { getSetting } = await import('../db');
      const val = await getSetting('missing_key');
      expect(val).toBeNull();
    });

    it('setSetting upserts value', async () => {
      const { setSetting } = await import('../db');
      await setSetting('test_key', 'test_val');
      
      const queryCall = mockPool.query.mock.calls.find((call: any[]) => 
        typeof call[0] === 'object' && call[0].text?.includes('INSERT INTO settings')
      ) as any;
      expect(queryCall).toBeDefined();
      expect(queryCall[0].values).toEqual(['test_key', 'test_val', 'test_val']);
    });
  });

  describe('endpoints', () => {
    it('listEndpoints returns endpoints', async () => {
      const mockEndpoints = [{ id: '1', name: 'ep1', api_key: 'key1' }];
      mockPool.query.mockImplementation(async (sql: any) => {
        if (typeof sql === 'string' && sql.includes('SELECT * FROM endpoints')) {
          return { rows: mockEndpoints };
        }
        return defaultQuery(sql);
      });
      
      const { listEndpoints } = await import('../db');
      const eps = await listEndpoints();
      
      expect(eps).toEqual(mockEndpoints);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM endpoints ORDER BY created_at DESC'), undefined);
    });

    it('upsertEndpoint creates new endpoint', async () => {
      mockPool.query.mockImplementation(async (sql: any) => {
        if (typeof sql === 'string' && sql.includes('SELECT * FROM endpoints WHERE id')) {
          return { rows: [{ id: 'new-id', name: 'new-ep' }] };
        }
        return defaultQuery(sql);
      });
      
      const { upsertEndpoint } = await import('../db');
      const res = await upsertEndpoint({
        name: 'new-ep',
        api_key: 'key-123',
      });
      
      expect(res).toBeDefined();
      const insertCall = mockPool.query.mock.calls.find((call: any[]) => 
        typeof call[0] === 'object' && call[0].text?.includes('INSERT INTO endpoints')
      ) as any;
      expect(insertCall).toBeDefined();
      expect(insertCall[0].values).toContain('new-ep');
      expect(insertCall[0].values).toContain('key-123');
    });
  });

  describe('runs and pruning', () => {
    it('pruneOldRuns deletes old runs', async () => {
      mockPool.query.mockImplementation(async (sql: any) => {
        if (typeof sql === 'string' && sql.includes('DELETE FROM runs')) {
          return { rowCount: 5, rows: [] };
        }
        return defaultQuery(sql);
      });
      
      const { pruneOldRuns } = await import('../db');
      const count = await pruneOldRuns(30);
      
      expect(count).toBe(5);
      const deleteCall = mockPool.query.mock.calls.find((call: any[]) => 
        typeof call[0] === 'string' && call[0].includes('DELETE FROM runs WHERE generated_at < $1')
      ) as any;
      expect(deleteCall).toBeDefined();
    });
  });

  describe('insertSnapshot', () => {
    it('returns false if run already exists', async () => {
      mockPool.query.mockImplementation(async (sql: any) => {
        if (typeof sql === 'string' && sql.includes('SELECT 1 FROM runs')) {
          return { rows: [{ '?column?': 1 }] };
        }
        return defaultQuery(sql);
      });
      
      const { insertSnapshot } = await import('../db');
      const res = await insertSnapshot({
        run_id: 'existing-run',
        generated_at: new Date().toISOString(),
        heartbeat_ok: true,
        run_quality: 'ok',
        severity: null,
        canary_status: 'ok',
        canary_alert: false,
        outage_suspected: false,
        alert_count: 0,
        rule_version: 1,
        in_maintenance_window: false,
        total_pages: 0,
        active_pages_count: 0,
        inactive_pages_count: 0,
        receiver_sd_size_bytes: 0,
        raw_summary: {},
        active_pages: [],
        inactive_pages: [],
      });
      
      expect(res.inserted).toBe(false);
    });

    it('inserts new snapshot', async () => {
      const { insertSnapshot } = await import('../db');
      const res = await insertSnapshot({
        run_id: 'new-run',
        generated_at: new Date().toISOString(),
        heartbeat_ok: true,
        run_quality: 'ok',
        severity: null,
        canary_status: 'ok',
        canary_alert: false,
        outage_suspected: false,
        alert_count: 0,
        rule_version: 1,
        in_maintenance_window: false,
        total_pages: 1,
        active_pages_count: 1,
        inactive_pages_count: 0,
        receiver_sd_size_bytes: 0,
        raw_summary: {},
        active_pages: [{ name: 'Page 1', page_id: 'p1', shop_label: 'Shop' }],
        inactive_pages: [],
      });
      
      expect(res.inserted).toBe(true);
      expect(mockPool.connect).toHaveBeenCalled();
      
      const clientInsertCall = mockClient.query.mock.calls.find((call: any[]) => 
        typeof call[0] === 'object' && call[0].text?.includes('INSERT INTO runs')
      ) as any;
      expect(clientInsertCall).toBeDefined();
    });
  });
  
  describe('ensureMonthlyPartitions', () => {
    it('creates missing partitions', async () => {
      const { ensureMonthlyPartitions } = await import('../db');
      await ensureMonthlyPartitions();
      
      const createCalls = mockPool.query.mock.calls.filter((call: any[]) => 
        typeof call[0] === 'string' && call[0].includes('CREATE TABLE IF NOT EXISTS page_states_')
      );
      // -3 to +6 is 10 partitions
      expect(createCalls.length).toBe(10);
    });
  });

  describe('slugify', () => {
    it('converts name to lowercase slug', async () => {
      const { slugify } = await import('../db');
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('My Shop!')).toBe('my-shop');
      expect(slugify('  Extra   Spaces  ')).toBe('extra-spaces');
      expect(slugify('Special@#$Chars')).toBe('specialchars');
    });
  });

  describe('endpoint CRUD', () => {
    it('getEndpoint returns undefined for missing', async () => {
      const { getEndpoint } = await import('../db');
      const ep = await getEndpoint('missing');
      expect(ep).toBeUndefined();
    });

    it('deleteEndpoint deletes platform pages and endpoint', async () => {
      const { deleteEndpoint } = await import('../db');
      await deleteEndpoint('ep1');
      const deleteCalls = mockPool.query.mock.calls.filter((call: any[]) =>
        typeof call[0] === 'string' && call[0].includes('DELETE FROM')
      );
      expect(deleteCalls.length).toBe(2);
      expect(deleteCalls[0][0]).toContain('DELETE FROM platform_pages');
      expect(deleteCalls[1][0]).toContain('DELETE FROM endpoints');
    });

    it('touchEndpoint updates last_used_at', async () => {
      const { touchEndpoint } = await import('../db');
      await touchEndpoint('ep1');
      const updateCall = mockPool.query.mock.calls.find((call: any[]) =>
        typeof call[0] === 'string' && call[0].includes('UPDATE endpoints SET last_used_at')
      ) as any;
      expect(updateCall).toBeDefined();
      expect(updateCall[1][1]).toBe('ep1');
      expect(typeof updateCall[1][0]).toBe('string');
    });
  });

  describe('run queries', () => {
    it('getLatestRun queries with endpointId', async () => {
      const { getLatestRun } = await import('../db');
      const result = await getLatestRun('ep1');
      const queryCall = mockPool.query.mock.calls.find((call: any[]) =>
        typeof call[0] === 'string' && call[0].includes('ORDER BY generated_at DESC LIMIT 1')
      ) as any;
      expect(queryCall).toBeDefined();
      expect(result).toBeUndefined();
    });

    it('getRunHistory returns runs', async () => {
      mockPool.query.mockImplementation(async (sql: any) => {
        if (typeof sql === 'string' && sql.includes('SELECT * FROM runs')) {
          return { rows: [{ run_id: 'r1', endpoint_id: 'ep1' }] };
        }
        return defaultQuery(sql);
      });
      const { getRunHistory } = await import('../db');
      const runs = await getRunHistory('ep1');
      expect(runs).toHaveLength(1);
      expect(runs[0].run_id).toBe('r1');
    });

    it('getRecentRuns returns runs', async () => {
      const { getRecentRuns } = await import('../db');
      const runs = await getRecentRuns();
      expect(Array.isArray(runs)).toBe(true);
    });
  });

  describe('sessions', () => {
    it('createSessionToken inserts and returns token', async () => {
      const { createSessionToken } = await import('../db');
      const token = await createSessionToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      const insertCall = mockPool.query.mock.calls.find((call: any[]) =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO sessions')
      ) as any;
      expect(insertCall).toBeDefined();
      expect(insertCall[1][1]).toBe('admin');
    });

    it('getSessionRole returns null for missing token', async () => {
      const { getSessionRole } = await import('../db');
      const role = await getSessionRole(null);
      expect(role).toBeNull();
    });

    it('getSessionRole returns role for valid token', async () => {
      mockPool.query.mockImplementation(async (sql: any) => {
        if (typeof sql === 'string' && sql.includes('SELECT role FROM sessions')) {
          return { rows: [{ role: 'admin' }] };
        }
        return defaultQuery(sql);
      });
      const { getSessionRole } = await import('../db');
      const role = await getSessionRole('valid-token');
      expect(role).toBe('admin');
    });

    it('requireAdminSession returns false for null token', async () => {
      const { requireAdminSession } = await import('../db');
      const ok = await requireAdminSession(null);
      expect(ok).toBe(false);
    });

    it('validateSessionToken returns false for null token', async () => {
      const { validateSessionToken } = await import('../db');
      const ok = await validateSessionToken(null);
      expect(ok).toBe(false);
    });

    it('clearSessionToken deletes session', async () => {
      const { clearSessionToken } = await import('../db');
      await clearSessionToken('some-token');
      const deleteCall = mockPool.query.mock.calls.find((call: any[]) =>
        typeof call[0] === 'string' && call[0].includes('DELETE FROM sessions WHERE token')
      ) as any;
      expect(deleteCall).toBeDefined();
      expect(deleteCall[1]).toEqual(['some-token']);
    });

    it('pruneExpiredSessions deletes expired', async () => {
      const { pruneExpiredSessions } = await import('../db');
      await pruneExpiredSessions();
      const deleteCall = mockPool.query.mock.calls.find((call: any[]) =>
        typeof call[0] === 'string' && call[0].includes('DELETE FROM sessions WHERE expires_at')
      ) as any;
      expect(deleteCall).toBeDefined();
    });
  });

  describe('platform pages', () => {
    it('listPlatformPages returns pages', async () => {
      mockPool.query.mockImplementation(async (sql: any) => {
        if (typeof sql === 'string' && sql.includes('SELECT * FROM platform_pages')) {
          return { rows: [{ id: 'p1', page_name: 'Test Page' }] };
        }
        return defaultQuery(sql);
      });
      const { listPlatformPages } = await import('../db');
      const pages = await listPlatformPages();
      expect(pages).toHaveLength(1);
    });

    it('deletePlatformPage deletes by id', async () => {
      const { deletePlatformPage } = await import('../db');
      await deletePlatformPage('p1');
      const deleteCall = mockPool.query.mock.calls.find((call: any[]) =>
        typeof call[0] === 'string' && call[0].includes('DELETE FROM platform_pages WHERE id')
      ) as any;
      expect(deleteCall).toBeDefined();
      expect(deleteCall[1]).toEqual(['p1']);
    });
  });

  describe('audit log', () => {
    it('logAuditEntry inserts entry', async () => {
      const { logAuditEntry } = await import('../db');
      await logAuditEntry('test_action', 'endpoint', 'ep1', 'test detail', '127.0.0.1');
      const insertCall = mockPool.query.mock.calls.find((call: any[]) =>
        typeof call[0] === 'object' && call[0].text?.includes('INSERT INTO audit_log')
      ) as any;
      expect(insertCall).toBeDefined();
      expect(insertCall[0].values).toContain('test_action');
    });
  });

  describe('botcake overrides', () => {
    it('removeBotCakeOverride deletes by page_id', async () => {
      const { removeBotCakeOverride } = await import('../db');
      await removeBotCakeOverride('bp1');
      const deleteCall = mockPool.query.mock.calls.find((call: any[]) =>
        typeof call[0] === 'string' && call[0].includes('DELETE FROM botcake_overrides WHERE page_id')
      ) as any;
      expect(deleteCall).toBeDefined();
      expect(deleteCall[1]).toEqual(['bp1']);
    });
  });
});
