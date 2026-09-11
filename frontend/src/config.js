/* eslint-disable no-undef */
// Environment variable handling in production build images
// Requires runtime placement of vars to prevent rebuilding the image
// This application is run via Caddy file server with templates directive
// to dynamically inject environment variables at runtime

const config = {
  KEYCLOAK_CLIENT_ID:
    window.VITE_KEYCLOAK_CLIENT_ID || import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'notify-6388',
  API_BASE_URL: window.VITE_API_URL || import.meta.env.VITE_API_URL || '/api',
  KEYCLOAK_URL:
    window.VITE_KEYCLOAK_URL ||
    import.meta.env.VITE_KEYCLOAK_URL ||
    'https://dev.loginproxy.gov.bc.ca/auth',
  KEYCLOAK_REALM: window.VITE_KEYCLOAK_REALM || import.meta.env.VITE_KEYCLOAK_REALM || 'standard',
  API_GATEWAY_NOTIFY_URL:
    window.VITE_API_GATEWAY_NOTIFY_URL ||
    import.meta.env.VITE_API_GATEWAY_NOTIFY_URL ||
    'https://gw-cnotify-notify.dev.api.gov.bc.ca',
  MAX_NOTIFICATION_RESULTS_PER_PAGE:
    window.VITE_MAX_NOTIFICATION_RESULTS_PER_PAGE ||
    import.meta.env.VITE_MAX_NOTIFICATION_RESULTS_PER_PAGE ||
    '',
  CSTAR_TENANT_SETUP_URL:
    window.VITE_CSTAR_TENANT_SETUP_URL || import.meta.env.VITE_CSTAR_TENANT_SETUP_URL || '',
  // API key help links, shown beside the API key field in Tenant Settings. Both point at
  // the APS platform techdocs. Set to '' to hide a link rather than pointing it somewhere
  // provisional — ApiKeyField omits any link whose URL is empty.
  API_KEY_DOCS_URL:
    window.VITE_API_KEY_DOCS_URL ||
    import.meta.env.VITE_API_KEY_DOCS_URL ||
    'https://developer.gov.bc.ca/docs/default/component/aps-infra-platform-docs/concepts/protect-api/#kong-api-key',
  // Revoking is done on the API gateway, never in Notify — it is the only place that
  // stops the gateway honouring the key.
  API_KEY_REVOKE_URL:
    window.VITE_API_KEY_REVOKE_URL ||
    import.meta.env.VITE_API_KEY_REVOKE_URL ||
    'https://api.gov.bc.ca/manager/consumers',
}

export default config
