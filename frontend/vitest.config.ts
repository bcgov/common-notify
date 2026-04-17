import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read frontend package.json for version
const frontendPackageJson = JSON.parse(readFileSync(resolve(__dirname, './package.json'), 'utf-8'))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tsconfigPaths()],
  define: {
    __APP_VERSION__: JSON.stringify(frontendPackageJson.version),
  },
  test: {
    exclude: ['**/node_modules/**', '**/e2e/**'],
    globals: true,
    environment: 'jsdom',
    setupFiles: 'src/test-setup.ts',
    // you might want to disable it, if you don't have tests that rely on CSS
    // since parsing CSS is slow
    css: false,
    coverage: {
      reporter: ['lcov', 'text-summary', 'text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/*.config.*',
        'src/routeTree.gen.ts', // Auto-generated file
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.tsx',
        'src/__tests__/**',
      ],
    },
  },
})
