// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

function mockController(): ReadableStreamDefaultController {
  return { enqueue: vi.fn(), close: vi.fn(), error: vi.fn(), desiredSize: null } as unknown as ReadableStreamDefaultController;
}

describe('SSE module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('addClient / removeClient / getClientCount', () => {
    it('adds a client and returns true', async () => {
      const { addClient, getClientCount } = await import('../sse');
      const ok = addClient('id-1', mockController());
      expect(ok).toBe(true);
      expect(getClientCount()).toBe(1);
    });

    it('removes a client and decrements count', async () => {
      const { addClient, removeClient, getClientCount } = await import('../sse');
      addClient('id-1', mockController());
      addClient('id-2', mockController());
      expect(getClientCount()).toBe(2);
      removeClient('id-1');
      expect(getClientCount()).toBe(1);
    });

    it('handles remove of unknown id gracefully', async () => {
      const { removeClient, getClientCount } = await import('../sse');
      removeClient('non-existent');
      expect(getClientCount()).toBe(0);
    });

    it('stores scope when provided', async () => {
      const { addClient, getClientCount } = await import('../sse');
      addClient('id-1', mockController(), 'ep-1');
      expect(getClientCount()).toBe(1);
    });
  });

  describe('MAX_CLIENTS cap', () => {
    it('rejects client when at capacity (MAX_CLIENTS = 1)', async () => {
      vi.stubEnv('SSE_MAX_CLIENTS', '1');
      const { addClient, getClientCount } = await import('../sse');
      expect(addClient('id-1', mockController())).toBe(true);
      expect(getClientCount()).toBe(1);
      expect(addClient('id-2', mockController())).toBe(false);
      expect(getClientCount()).toBe(1);
      vi.unstubAllEnvs();
    });

    it('accepts client when under capacity', async () => {
      vi.stubEnv('SSE_MAX_CLIENTS', '10');
      const { addClient, getClientCount } = await import('../sse');
      for (let i = 0; i < 9; i++) {
        expect(addClient(`id-${i}`, mockController())).toBe(true);
      }
      expect(getClientCount()).toBe(9);
      vi.unstubAllEnvs();
    });

    it('defaults to 500 when env var is not set', async () => {
      const { MAX_CLIENTS, addClient, getClientCount } = await import('../sse');
      expect(MAX_CLIENTS).toBe(500);
      for (let i = 0; i < 500; i++) {
        addClient(`id-${i}`, mockController());
      }
      expect(getClientCount()).toBe(500);
      expect(addClient('overflow', mockController())).toBe(false);
    });
  });
});
