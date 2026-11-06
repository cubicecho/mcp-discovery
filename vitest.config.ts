import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    coverage: { provider: 'v8', include: ['src/**'], reporter: ['text', 'html'] },
  },
});
