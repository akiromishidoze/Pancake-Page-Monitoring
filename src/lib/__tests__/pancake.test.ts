import { describe, it, expect } from 'vitest';
import { mergePagesActivation, filterTargetShops, TARGET_SHOP_IDS } from '@/lib/pancake';

describe('mergePagesActivation', () => {
  it('returns shops with merged activation status', () => {
    const shops = [{
      id: 1, name: 'Shop A',
      pages: [
        { id: 'p1', name: 'Page 1', is_activated: null },
        { id: 'p2', name: 'Page 2', is_activated: null },
      ],
    }];
    const pagesApi = [
      { id: 'p1', name: 'Page 1', is_activated: true },
    ];
    const result = mergePagesActivation(shops, pagesApi);
    expect(result).toHaveLength(1);
    expect(result[0].pages).toHaveLength(2);
    expect(result[0].pages[0].is_activated).toBe(true);
    expect(result[0].pages[1].is_activated).toBeNull();
  });

  it('handles empty shops', () => {
    const result = mergePagesActivation([], []);
    expect(result).toEqual([]);
  });

  it('handles empty pagesApi — sets is_activated to null (no authoritative data)', () => {
    const shops = [{
      id: 1, name: 'Shop A',
      pages: [{ id: 'p1', name: 'Page 1', is_activated: true }],
    }];
    const result = mergePagesActivation(shops, []);
    expect(result[0].pages[0].is_activated).toBeNull();
  });

  it('merges platform field', () => {
    const shops = [{
      id: 1, name: 'Shop A',
      pages: [{ id: 'p1', name: 'Page 1', is_activated: null }],
    }];
    const pagesApi = [
      { id: 'p1', name: 'Page 1', is_activated: true, platform: 'facebook' },
    ];
    const result = mergePagesActivation(shops, pagesApi);
    expect(result[0].pages[0].platform).toBe('facebook');
  });

  it('overrides activation with pagesApi data', () => {
    const shops = [{
      id: 1, name: 'Shop A',
      pages: [{ id: 'p1', name: 'Page 1', is_activated: true }],
    }];
    const pagesApi = [
      { id: 'p1', name: 'Page 1', is_activated: false },
    ];
    const result = mergePagesActivation(shops, pagesApi);
    expect(result[0].pages[0].is_activated).toBe(false);
  });
});

describe('filterTargetShops', () => {
  it('filters shops by target IDs', () => {
    const shops = [
      { id: 1, name: 'Shop A', pages: [] },
      { id: 2, name: 'Shop B', pages: [] },
      { id: 3, name: 'Shop C', pages: [] },
    ];
    const result = filterTargetShops(shops, [1, 3]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Shop A');
    expect(result[1].name).toBe('Shop C');
  });

  it('returns empty array when no targets match', () => {
    const shops = [
      { id: 1, name: 'Shop A', pages: [] },
    ];
    const result = filterTargetShops(shops, [99]);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(filterTargetShops([], [1, 2])).toEqual([]);
  });
});

describe('TARGET_SHOP_IDS', () => {
  it('contains expected shop IDs', () => {
    expect(TARGET_SHOP_IDS).toEqual([430202960, 1635192689, 1942241731]);
  });
});
