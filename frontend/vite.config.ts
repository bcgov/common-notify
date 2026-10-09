import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read frontend package.json for version
const frontendPackageJson = JSON.parse(readFileSync(resolve(__dirname, './package.json'), 'utf-8'))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(frontendPackageJson.version),
  },
  server: {
    port: parseInt(process.env.PORT),
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
    proxy: {
      // Proxy API requests to Kong API Gateway (or local Kong in development)
      '/api': {
        target: process.env.VITE_API_GATEWAY_NOTIFY_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
      // GC Notify-compatible API, which has no /api prefix (see backend/src/app.ts)
      '/gcnotify/': {
        target: process.env.VITE_API_GATEWAY_NOTIFY_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    // https://vitejs.dev/config/shared-options.html#resolve-alias
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~': fileURLToPath(new URL('./node_modules', import.meta.url)),
      '~bootstrap': fileURLToPath(new URL('./node_modules/bootstrap', import.meta.url)),
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  build: {
    // Build Target
    // https://vitejs.dev/config/build-options.html#build-target
    target: 'esnext',
    // Minify option
    // https://vitejs.dev/config/build-options.html#build-minify
    // oxc is Vite 8's bundled minifier; 'esbuild' now needs esbuild installed separately.
    minify: 'oxc',
    // Rollup Options
    // https://vitejs.dev/config/build-options.html#build-rollupoptions
    rollupOptions: {
      output: {
        // Split external library from transpiled code. Function form: Vite 8 builds with
        // rolldown, which does not take the object form.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom)\//.test(id)) return 'react'
        },
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Silence deprecation warnings caused by Bootstrap SCSS
        // which is out of our control.
        silenceDeprecations: [
          'mixed-decls',
          'color-functions',
          'global-builtin',
          'import',
          'if-function',
        ],
      },
    },
  },
})
