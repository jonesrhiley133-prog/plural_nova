import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each file opens its own database, so isolation is per-file rather than
    // per-test and the suite stays fast.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
