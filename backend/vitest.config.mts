import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['**/*.e2e-spec.ts', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', 'e2e/**'],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text-summary', 'text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/*.config.*',
        '**/*.spec.ts',
        '**/*.e2e-spec.ts',
        '**/schemas/**',
        '**/interfaces/**',
        '**/enums/**',
        '**/*.dto.ts',
        'app.ts', // Application bootstrap, tested via e2e
        'main.ts', // Server entry point, tested via e2e
        '**/index.ts', // Barrel files/exports, typically re-exports only
      ],
    },
  },
  plugins: [swc.vite()],
})
