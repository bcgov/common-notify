const config = {
  KEYCLOAK_CLIENT_ID: globalThis.VITE_KEYCLOAK_CLIENT_ID || import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  API_BASE_URL: globalThis.VITE_API_URL || import.meta.env.VITE_API_URL,
  KEYCLOAK_URL: globalThis.VITE_KEYCLOAK_URL || import.meta.env.VITE_KEYCLOAK_URL,
  KEYCLOAK_REALM: globalThis.VITE_KEYCLOAK_REALM || import.meta.env.VITE_KEYCLOAK_REALM,
}

export default config
