/// <reference types="vite/client" />

declare module '*.scss'

interface ImportMetaEnv {
  readonly VITE_MAX_NOTIFICATION_RESULTS_PER_PAGE?: string
}

interface Window {
  VITE_MAX_NOTIFICATION_RESULTS_PER_PAGE?: string
}
