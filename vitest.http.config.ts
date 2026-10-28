import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/http/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 45000,
    maxWorkers: 1,
  },
});
