import { defineConfig } from 'vitest/config';

// Security-rules tests need the Firestore emulator: run with `npm run test:rules`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['rules-tests/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
