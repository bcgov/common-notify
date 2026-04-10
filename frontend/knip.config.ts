import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  project: [
    'src/**/*.{ts,tsx}',
    'e2e/**/*.ts',
    'playwright.config.ts',
    'vite.config.ts',
    'vitest.config.ts',
  ],
}

export default config
