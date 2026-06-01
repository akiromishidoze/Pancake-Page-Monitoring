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
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM endpoints ORDER BY created_at DESC'));
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
});
