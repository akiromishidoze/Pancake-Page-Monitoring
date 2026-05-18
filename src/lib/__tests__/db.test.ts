import { describe, it, expect } from 'vitest';
import type { SlimPage, RunRow, PageStateRow, EndpointRow, PlatformPageRow, InsertSnapshotInput } from '@/lib/db';

describe('exported types', () => {
  it('SlimPage is a valid type', () => {
    const page: SlimPage = { name: 'Test Page' };
    expect(page.name).toBe('Test Page');
  });

  it('SlimPage accepts optional fields', () => {
    const page: SlimPage = {
      name: 'Test',
      shop: 'Shop A',
      page_id: '123',
      is_canary: true,
    };
    expect(page.shop).toBe('Shop A');
    expect(page.is_canary).toBe(true);
  });

  it('RunRow requires run_id and endpoint_id', () => {
    const run: RunRow = {
      run_id: 'test_123',
      endpoint_id: 'ep1',
      generated_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
    };
    expect(run.run_id).toBe('test_123');
  });

  it('PageStateRow requires run_id, page_id, generated_at', () => {
    const ps: PageStateRow = {
      run_id: 'run_1',
      page_id: 'page_1',
      generated_at: new Date().toISOString(),
    };
    expect(ps.run_id).toBe('run_1');
  });

  it('EndpointRow requires id, name, api_key', () => {
    const ep: EndpointRow = {
      id: 'ep1',
      name: 'Test Endpoint',
      api_key: 'key-123',
      is_active: 1,
      created_at: new Date().toISOString(),
    };
    expect(ep.name).toBe('Test Endpoint');
  });

  it('PlatformPageRow requires id, endpoint_id, page_name', () => {
    const pp: PlatformPageRow = {
      id: 'pp1',
      endpoint_id: 'ep1',
      page_name: 'Page 1',
      is_active: 1,
    };
    expect(pp.page_name).toBe('Page 1');
  });

  it('InsertSnapshotInput requires run_id and endpoint_id', () => {
    const input: InsertSnapshotInput = {
      run_id: 'run_1',
      endpoint_id: 'ep1',
      generated_at: new Date().toISOString(),
      page_states: [],
    };
    expect(input.run_id).toBe('run_1');
  });
});
