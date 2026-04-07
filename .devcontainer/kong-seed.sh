#!/bin/bash

# Kong Seed Script
# Creates test tenants and API keys for local development

set -e

KONG_ADMIN_URL="http://kong:8001"
echo "Seeding Kong at $KONG_ADMIN_URL..."

# Wait for Kong to be ready
until curl -s "$KONG_ADMIN_URL/status" > /dev/null; do
  echo "Waiting for Kong to be ready..."
  sleep 2
done

echo "Kong is ready!"

# Create service (if not exists)
echo "Setting up Notify API service..."
curl -s -X POST "$KONG_ADMIN_URL/services" \
  --data-urlencode "name=notify" \
  --data-urlencode "url=http://backend:3000" \
  --data-urlencode "protocol=http" \
  2>/dev/null || echo "Service may already exist"

# Create admin route (JWT validation now happens in backend)
echo "Setting up admin route..."
ADMIN_ROUTE=$(curl -s -X POST "$KONG_ADMIN_URL/services/notify/routes" \
  --data-urlencode "name=notify-admin-route" \
  --data-urlencode "paths[]=/api/v1/admin" \
  --data-urlencode "strip_path=false" \
  2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$ADMIN_ROUTE" ]; then
  echo "  Admin route may already exist, fetching..."
  ADMIN_ROUTE=$(curl -s "$KONG_ADMIN_URL/routes?name=notify-admin-route" 2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
fi

# Enable JWT plugin on admin route (if not exists)
echo "Enabling JWT plugin on admin route..."
curl -s -X POST "$KONG_ADMIN_URL/routes/$ADMIN_ROUTE/plugins" \
  --data-urlencode "name=jwt" \
  --data-urlencode "config.algorithm=RS256" \
  --data-urlencode "config.jwks_uri=$JWKS_URI" \
  --data-urlencode "config.issuer=$JWT_ISSUER" \
  --data-urlencode "config.audience=$KEYCLOAK_CLIENT_ID" \
  2>/dev/null || echo "JWT plugin may already exist on admin route"

# Users module is part of the template, it is being used to test api gateway routing
# Remove this when users module is deleted
# Create users route with JWT (if not exists)
echo "Setting up users route with JWT authentication..."
USERS_ROUTE=$(curl -s -X POST "$KONG_ADMIN_URL/services/notify/routes" \
  --data-urlencode "name=notify-users-route" \
  --data-urlencode "paths[]=/api/v1/users" \
  --data-urlencode "strip_path=false" \
  2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$USERS_ROUTE" ]; then
  echo "  Users route may already exist, fetching..."
  USERS_ROUTE=$(curl -s "$KONG_ADMIN_URL/routes?name=notify-users-route" 2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
fi

# Enable JWT plugin on users route (if not exists)
echo "Enabling JWT plugin on users route..."
curl -s -X POST "$KONG_ADMIN_URL/routes/$USERS_ROUTE/plugins" \
  --data-urlencode "name=jwt" \
  --data-urlencode "config.algorithm=RS256" \
  --data-urlencode "config.jwks_uri=$JWKS_URI" \
  --data-urlencode "config.issuer=$JWT_ISSUER" \
  --data-urlencode "config.audience=$KEYCLOAK_CLIENT_ID" \
  2>/dev/null || echo "JWT plugin may already exist on users route"

# users routes end

# Create ches route with key-auth (if not exists)
echo "Setting up ches route with key-auth authentication..."
CHES_ROUTE=$(curl -s -X POST "$KONG_ADMIN_URL/services/notify/routes" \
  --data-urlencode "name=notify-ches-route" \
  --data-urlencode "paths[]=/api/v1/ches" \
  --data-urlencode "strip_path=false" \
  2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$CHES_ROUTE" ]; then
  echo "  Ches route may already exist, fetching..."
  CHES_ROUTE=$(curl -s "$KONG_ADMIN_URL/routes?name=notify-ches-route" 2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
fi

# Enable key-auth plugin on ches route (if not exists)
echo "Enabling key-auth plugin on ches route..."
curl -s -X POST "$KONG_ADMIN_URL/routes/$CHES_ROUTE/plugins" \
  --data-urlencode "name=key-auth" \
  --data-urlencode "config.key_names[]=x-api-key" \
  --data-urlencode "config.key_in_body=false" \
  --data-urlencode "config.hide_credentials=true" \
  2>/dev/null || echo "Key-auth plugin may already exist on ches route"

# Create email route with key-auth (if not exists)
echo "Setting up email route with key-auth authentication..."
EMAIL_ROUTE=$(curl -s -X POST "$KONG_ADMIN_URL/services/notify/routes" \
  --data-urlencode "name=notify-email-route" \
  --data-urlencode "paths[]=/api/v1/email" \
  --data-urlencode "strip_path=false" \
  2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$EMAIL_ROUTE" ]; then
  echo "  Email route may already exist, fetching..."
  EMAIL_ROUTE=$(curl -s "$KONG_ADMIN_URL/routes?name=notify-email-route" 2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
fi

# Create OAuth2 token endpoint route and service
echo "Setting up OAuth2 token endpoint..."

# Create OAuth2 token endpoint route (attached to notify service)
echo "Setting up OAuth2 token endpoint..."
# Use the notify service - OAuth2 plugin will intercept /oauth2/token before routing
TOKEN_ROUTE=$(curl -s -X POST "$KONG_ADMIN_URL/services/notify/routes" \
  --data-urlencode "name=notify-oauth2-token-route" \
  --data-urlencode "paths[]=/oauth2/token" \
  --data-urlencode "strip_path=false" \
  2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$TOKEN_ROUTE" ]; then
  echo "  Token route may already exist, fetching..."
  TOKEN_ROUTE=$(curl -s "$KONG_ADMIN_URL/routes?name=notify-oauth2-token-route" 2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
fi

# Enable OAuth2 plugin on token endpoint route
echo "Enabling OAuth2 plugin on token endpoint..."
curl -s -X POST "$KONG_ADMIN_URL/routes/$TOKEN_ROUTE/plugins" \
  --data-urlencode "name=oauth2" \
  --data-urlencode "config.scopes[]=notify" \
  --data-urlencode "config.token_expiration=3600" \
  --data-urlencode "config.enable_client_credentials=true" \
  --data-urlencode "config.hide_credentials=true" \
  --data-urlencode "config.accept_http_if_already_terminated=true" \
  2>/dev/null || echo "OAuth2 plugin may already exist on token route"

# Enable key-auth plugin on email route
echo "Enabling key-auth plugin on email route..."
curl -s -X POST "$KONG_ADMIN_URL/routes/$EMAIL_ROUTE/plugins" \
  --data-urlencode "name=key-auth" \
  --data-urlencode "config.key_names[]=x-api-key" \
  --data-urlencode "config.hide_credentials=true" \
  2>/dev/null || echo "Key-auth plugin may already exist on email route"

# Enable OAuth2 plugin on email route
echo "Enabling OAuth2 plugin on email route..."
curl -s -X POST "$KONG_ADMIN_URL/routes/$EMAIL_ROUTE/plugins" \
  --data-urlencode "name=oauth2" \
  --data-urlencode "config.scopes[]=notify" \
  --data-urlencode "config.token_expiration=3600" \
  --data-urlencode "config.enable_client_credentials=true" \
  --data-urlencode "config.hide_credentials=true" \
  --data-urlencode "config.accept_http_if_already_terminated=true" \
  2>/dev/null || echo "OAuth2 plugin may already exist on email route"

# Create test tenants (consumers) and API keys
echo "Creating test tenants and API keys..."

# Tenant 1: Test Tenant A
echo "  Creating tenant: test-tenant-a"
CONSUMER_A=$(curl -s -X POST "$KONG_ADMIN_URL/consumers" \
  --data-urlencode "username=test-tenant-a" \
  --data-urlencode "custom_id=tenant-a" \
  2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$CONSUMER_A" ]; then
  echo "    Consumer may already exist, fetching..."
  CONSUMER_A=$(curl -s "$KONG_ADMIN_URL/consumers/test-tenant-a" 2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
fi

echo "    Creating API key for test-tenant-a"
API_KEY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$KONG_ADMIN_URL/consumers/test-tenant-a/key-auth" \
  --data-urlencode "key=test-api-key-a-12345678901234567890" \
  2>/dev/null)
HTTP_CODE=$(echo "$API_KEY_RESPONSE" | tail -n 1)
if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "409" ]; then
  echo "    API key created successfully"
  echo "    API Key: test-api-key-a-12345678901234567890"
else
  echo "    API key may already exist"
fi

# Create OAuth2 credentials for Tenant A (client credentials flow)
echo "    Creating OAuth2 credentials for test-tenant-a"
OAUTH2_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$KONG_ADMIN_URL/consumers/test-tenant-a/oauth2" \
  --data-urlencode "client_id=test-client-a" \
  --data-urlencode "client_secret=test-client-secret-a-12345678901234567890" \
  --data-urlencode "redirect_uris=http://localhost:3000/callback" \
  2>/dev/null)
HTTP_CODE=$(echo "$OAUTH2_RESPONSE" | tail -n 1)
if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "    OAuth2 credentials created successfully"
  echo "    Client ID: test-client-a"
  echo "    Client Secret: test-client-secret-a-12345678901234567890"
else
  echo "    OAuth2 credentials may already exist"
fi

# Tenant 2: Test Tenant B
echo "  Creating tenant: test-tenant-b"
CONSUMER_B=$(curl -s -X POST "$KONG_ADMIN_URL/consumers" \
  --data-urlencode "username=test-tenant-b" \
  --data-urlencode "custom_id=tenant-b" \
  2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$CONSUMER_B" ]; then
  echo "    Consumer may already exist, fetching..."
  CONSUMER_B=$(curl -s "$KONG_ADMIN_URL/consumers/test-tenant-b" 2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
fi

echo "    Creating API key for test-tenant-b"
API_KEY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$KONG_ADMIN_URL/consumers/test-tenant-b/key-auth" \
  --data-urlencode "key=test-api-key-b-98765432109876543210" \
  2>/dev/null)
HTTP_CODE=$(echo "$API_KEY_RESPONSE" | tail -n 1)
if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "409" ]; then
  echo "    API key created successfully"
  echo "    API Key: test-api-key-b-98765432109876543210"
else
  echo "    API key may already exist"
fi

# Create OAuth2 credentials for Tenant B
echo "    Creating OAuth2 credentials for test-tenant-b"
curl -s -X POST "$KONG_ADMIN_URL/consumers/test-tenant-b/oauth2" \
  --data-urlencode "client_id=test-client-b" \
  --data-urlencode "client_secret=test-client-secret-b-98765432109876543210" \
  --data-urlencode "redirect_uris=http://localhost:3000/callback" \
  2>/dev/null || echo "OAuth2 credentials may already exist for test-tenant-b"

# Tenant 3: Test Tenant C
echo "  Creating tenant: test-tenant-c"
CONSUMER_C=$(curl -s -X POST "$KONG_ADMIN_URL/consumers" \
  --data-urlencode "username=test-tenant-c" \
  --data-urlencode "custom_id=tenant-c" \
  2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$CONSUMER_C" ]; then
  echo "    Consumer may already exist, fetching..."
  CONSUMER_C=$(curl -s "$KONG_ADMIN_URL/consumers/test-tenant-c" 2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
fi

echo "    Creating API key for test-tenant-c"
API_KEY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$KONG_ADMIN_URL/consumers/test-tenant-c/key-auth" \
  --data-urlencode "key=test-api-key-c-11111111111111111111" \
  2>/dev/null)
HTTP_CODE=$(echo "$API_KEY_RESPONSE" | tail -n 1)
if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "409" ]; then
  echo "    API key created successfully"
  echo "    API Key: test-api-key-c-11111111111111111111"
else
  echo "    API key may already exist"
fi

# Create OAuth2 credentials for Tenant C
echo "    Creating OAuth2 credentials for test-tenant-c"
curl -s -X POST "$KONG_ADMIN_URL/consumers/test-tenant-c/oauth2" \
  --data-urlencode "client_id=test-client-c" \
  --data-urlencode "client_secret=test-client-secret-c-11111111111111111111" \
  --data-urlencode "redirect_uris=http://localhost:3000/callback" \
  2>/dev/null || echo "OAuth2 credentials may already exist for test-tenant-c"

echo ""
echo "✅ Kong seeding complete!"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "AUTHENTICATION METHODS - LOCAL DEVELOPMENT"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "✅ API Key Authentication"
echo "   Enabled on /api/v1/notifications route"
echo "   Test credentials:"
echo "     Tenant A: api_key=test-api-key-a-12345678901234567890"
echo "     Tenant B: api_key=test-api-key-b-98765432109876543210"
echo "     Tenant C: api_key=test-api-key-c-11111111111111111111"
echo ""
echo "✅ OAuth2 Client Credentials Flow"
echo "   Enabled on /api/v1/notifications route"
echo "   Test credentials:"
echo "     Tenant A: client_id=test-client-a, secret=test-client-secret-a-12345678901234567890"
echo "     Tenant B: client_id=test-client-b, secret=test-client-secret-b-98765432109876543210"
echo "     Tenant C: client_id=test-client-c, secret=test-client-secret-c-11111111111111111111"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "QUICK START EXAMPLES"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🔑 Test API Key Authentication:"
echo "  curl -X POST http://localhost:8000/api/v1/notifications/email/send \\"
echo "    -H 'x-api-key: test-api-key-a-12345678901234567890' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"to\":\"user@example.com\",\"subject\":\"Test\",\"body\":\"Test body\"}'"
echo ""
echo "🔑 Test OAuth2 Authentication:"
echo "  1. Get OAuth2 token using client credentials (see Postman collection)"
echo "  2. Include token in Authorization header: Authorization: Bearer <token>"
echo "  3. curl -X POST http://localhost:8000/api/v1/notifications/email/send \\"
echo "      -H 'Authorization: Bearer <token>' \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"to\":\"user@example.com\",\"subject\":\"Test\",\"body\":\"Test body\"}'"
echo ""
echo "🔑 Test via Postman:"
echo "  1. Open .devcontainer/postman/api-gateway-postman-collection.json"
echo "  2. Use 'Send Email (API Key)' or 'Send Email (OAuth2 Bearer Token)' request"
echo "  3. Load .devcontainer/postman/.env.postman.local.json as environment"
echo ""
echo "═══════════════════════════════════════════════════════════════"
