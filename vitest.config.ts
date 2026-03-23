import { defineConfig } from 'vitest/config'
// import { fileURLToPath } from 'node:url'
// import path from 'node:path'

// const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // resolve: {
  //   alias: {
  //     '@authcore/core': path.resolve(dirname, './packages/core/src/index.ts'),
  //     '@authcore/types': path.resolve(dirname, './packages/types/src/index.ts'),
  //     '@authcore/core-web': path.resolve(dirname, './packages/core-web/src/index.ts'),
  //     '@authcore/react': path.resolve(dirname, './packages/react/src/index.ts'),
  //   },
  // },
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
