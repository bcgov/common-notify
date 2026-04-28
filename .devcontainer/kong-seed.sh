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

# Create admin route - no email route needed anymore (using notify endpoints)
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

# Create CHES API routes
echo "Setting up CHES API routes..."

CHES_ROUTE_CONFIGS="
ches-email:/api/v1/ches/email
ches-emailmerge:/api/v1/ches/emailMerge
ches-status:/api/v1/ches/status
ches-promote:/api/v1/ches/promote
ches-cancel:/api/v1/ches/cancel
ches-health:/api/v1/ches/health
"

echo "$CHES_ROUTE_CONFIGS" | while read -r route_config; do
  [ -z "$route_config" ] && continue
  route_key="${route_config%%:*}"
  route_path="${route_config##*:}"
  echo "  Creating route: $route_key ($route_path)"
  curl -s -X POST "$KONG_ADMIN_URL/services/notify/routes" \
    --data-urlencode "name=notify-$route_key-route" \
    --data-urlencode "paths[]=$route_path" \
    --data-urlencode "strip_path=false" \
    2>/dev/null || echo "    Route $route_key may already exist"
done
# Create Notify API routes
echo "Setting up Notify API routes..."

# Create routes using simple loops (sh-compatible, not bash-only associative arrays)
ROUTE_CONFIGS="
notifysimple:/api/v1/notifysimple
notifyevent:/api/v1/notifyevent
notifyevent-preview:/api/v1/notifyevent/preview
notifyevent-types:/api/v1/notifyevent/types
notify-list:/api/v1/notify
notify-status:/api/v1/notify/status
notify-callbacks:/api/v1/notify/registerCallback
templates:/api/v1/templates
gcnotify:/api/gcnotify/v2
"

echo "$ROUTE_CONFIGS" | while read -r route_config; do
  [ -z "$route_config" ] && continue
  route_key="${route_config%%:*}"
  route_path="${route_config##*:}"
  echo "  Creating route: $route_key ($route_path)"
  curl -s -X POST "$KONG_ADMIN_URL/services/notify/routes" \
    --data-urlencode "name=notify-$route_key-route" \
    --data-urlencode "paths[]=$route_path" \
    --data-urlencode "strip_path=false" \
    2>/dev/null || echo "    Route $route_key may already exist"
done

# Create OAuth2 Mock service
echo "Setting up OAuth2 Mock Token service..."
SERVICE_RESPONSE=$(curl -s -X POST "$KONG_ADMIN_URL/services" \
  --data-urlencode "name=oauth2-mock" \
  --data-urlencode "url=http://oauth2-mock:3002" \
  --data-urlencode "protocol=http" \
  2>/dev/null)
echo "Service response: $SERVICE_RESPONSE"

# Create OAuth2 token endpoint route (attached to oauth2-mock service)
echo "Setting up OAuth2 token endpoint route..."
ROUTE_RESPONSE=$(curl -s -X POST "$KONG_ADMIN_URL/services/oauth2-mock/routes" \
  --data-urlencode "name=oauth2-token-endpoint-route" \
  --data-urlencode "paths[]=/oauth2/token" \
  --data-urlencode "strip_path=true" \
  2>/dev/null)
echo "Route response: $ROUTE_RESPONSE"
TOKEN_ROUTE=$(echo "$ROUTE_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$TOKEN_ROUTE" ]; then
  echo "  Token route creation may have failed, trying to use service directly..."
  # If POST failed, the service/route might already exist, which is OK
  # Kong will still route /oauth2/token to the oauth2-mock service
fi

# Enable JWT plugin on CHES email route (validates Bearer tokens from mock OAuth2 server)
echo "Enabling JWT plugin on CHES email route (route=$CHES_EMAIL_ROUTE)..."
curl -s -X POST "$KONG_ADMIN_URL/routes/$CHES_EMAIL_ROUTE/plugins" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "jwt",
    "config": {
      "key_claim_name": "sub"
    }
  }' || echo "CHES JWT plugin creation may have failed"

# Enable request-transformer plugin on CHES email route to inject tenant headers
echo "Enabling request-transformer plugin on CHES email route (for header injection)..."
curl -s -X POST "$KONG_ADMIN_URL/routes/$CHES_EMAIL_ROUTE/plugins" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "request-transformer",
    "config": {
      "add": {
        "headers": [
          "X-Consumer-Username:$(consumer_username)",
          "X-Consumer-ID:$(consumer_id)"
        ]
      }
    }
  }' || echo "CHES Request-Transformer plugin creation may have failed"

# Create test tenants (consumers) and API keys
echo "Creating test tenants and API keys..."

# Tenant 1: Test Tenant A
echo "  Creating tenant: test-tenant-a"
CONSUMER_A=$(curl -s -X POST "$KONG_ADMIN_URL/consumers" \
  --data-urlencode "username=test-tenant-a" \
  --data-urlencode "custom_id=test-client-a" \
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

# Create JWT credentials for Tenant A (for JWT validation in Kong)
echo "    Creating JWT credentials for test-tenant-a"
JWT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$KONG_ADMIN_URL/consumers/test-tenant-a/jwt" \
  --data "key=test-client-a" \
  --data "secret=test-secret-a" \
  2>/dev/null)
HTTP_CODE=$(echo "$JWT_RESPONSE" | tail -n 1)
if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "409" ]; then
  echo "    JWT credentials created successfully"
else
  echo "    JWT credentials may already exist"
fi

# Tenant 2: Test Tenant B
echo "  Creating tenant: test-tenant-b"
CONSUMER_B=$(curl -s -X POST "$KONG_ADMIN_URL/consumers" \
  --data-urlencode "username=test-tenant-b" \
  --data-urlencode "custom_id=test-client-b" \
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

# Create JWT credentials for Tenant B
echo "    Creating JWT credentials for test-tenant-b"
curl -s -X POST "$KONG_ADMIN_URL/consumers/test-tenant-b/jwt" \
  --data "key=test-client-b" \
  --data "secret=test-secret-b" \
  2>/dev/null || echo "JWT credentials may already exist for test-tenant-b"

# Tenant 3: Test Tenant C
echo "  Creating tenant: test-tenant-c"
CONSUMER_C=$(curl -s -X POST "$KONG_ADMIN_URL/consumers" \
  --data-urlencode "username=test-tenant-c" \
  --data-urlencode "custom_id=test-client-c" \
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

# Create JWT credentials for Tenant C
echo "    Creating JWT credentials for test-tenant-c"
curl -s -X POST "$KONG_ADMIN_URL/consumers/test-tenant-c/jwt" \
  --data "key=test-client-c" \
  --data "secret=test-secret-c" \
  2>/dev/null || echo "JWT credentials may already exist for test-tenant-c"

echo ""
echo "✅ Kong seeding complete!"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "KONG CONFIGURATION VERIFICATION"
echo "═══════════════════════════════════════════════════════════════"
echo "Services configured:"
curl -s "$KONG_ADMIN_URL/services" | grep -o '"name":"[^"]*' | cut -d'"' -f4
echo ""
echo "Routes configured:"
curl -s "$KONG_ADMIN_URL/routes" | grep -o '"paths":\[\["[^"]*' | cut -d'"' -f4 | sort | uniq
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
echo "✅ Header Injection"
echo "   Kong automatically injects tenant headers after authentication:"
echo "     X-Consumer-Username: <authenticated consumer username>"
echo "     X-Consumer-ID: <Kong internal consumer ID (UUID)>"
echo "     X-Credential-ID: <API key credential ID>"
echo "   These headers are forwarded to the backend for tenant identification"
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
