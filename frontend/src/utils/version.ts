// Version is injected by Vite at build time from root package.json
declare const __APP_VERSION__: string

export const APP_VERSION = __APP_VERSION__
export const APP_NAME = 'notify'
