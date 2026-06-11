import { defineConfig } from 'vitest/config';
import path from 'path';

process.env['ENCRYPTION_KEY'] = process.env['ENCRYPTION_KEY'] || 'test-encryption-key-for-unit-tests';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    setupFiles: ['./src/test-setup.ts'],
  },
});
