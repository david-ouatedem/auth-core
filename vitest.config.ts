import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    // Run integration tests sequentially to avoid DB conflicts
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
