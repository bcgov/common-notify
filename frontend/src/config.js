// Environment variable handling in production build images
// Requires runtime placement of vars to prevent rebuilding the image
// This application is run via Caddy file server with templates directive
// to dynamically inject environment variables at runtime

const config = {
  KEYCLOAK_CLIENT_ID: window.VITE_KEYCLOAK_CLIENT_ID || import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'notify-6388',
  API_BASE_URL: window.VITE_API_URL || import.meta.env.VITE_API_URL || '/api',
  KEYCLOAK_URL: window.VITE_KEYCLOAK_URL || import.meta.env.VITE_KEYCLOAK_URL || 'https://dev.loginproxy.gov.bc.ca/auth',
  KEYCLOAK_REALM: window.VITE_KEYCLOAK_REALM || import.meta.env.VITE_KEYCLOAK_REALM || 'standard',
  API_GATEWAY_NOTIFY_URL: window.VITE_API_GATEWAY_NOTIFY_URL || import.meta.env.VITE_API_GATEWAY_NOTIFY_URL || 'https://coco-notify-gateway.dev.api.gov.bc.ca',
}

export default config
