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

# Create route (if not exists)
echo "Setting up route..."
curl -s -X POST "$KONG_ADMIN_URL/services/notify/routes" \
  --data-urlencode "name=notify-route" \
  --data-urlencode "paths[]=/api" \
  --data-urlencode "strip_path=false" \
  2>/dev/null || echo "Route may already exist"

# Enable key-auth plugin on service (if not exists)
echo "Enabling key-auth plugin..."
curl -s -X POST "$KONG_ADMIN_URL/services/notify/plugins" \
  --data-urlencode "name=key-auth" \
  2>/dev/null || echo "Plugin may already exist"

# Enable JWT plugin on service (if not exists)
echo "Enabling JWT plugin..."
curl -s -X POST "$KONG_ADMIN_URL/services/notify/plugins" \
  --data-urlencode "name=jwt" \
  --data-urlencode "config.key_claim_name=iss" \
  --data-urlencode "config.secret_is_base64=false" \
  2>/dev/null || echo "JWT plugin may already exist"

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
API_KEY_BODY=$(echo "$API_KEY_RESPONSE" | head -n -1)
API_KEY_A=$(echo "$API_KEY_BODY" | grep -o '"key":"[^"]*' | head -1 | cut -d'"' -f4)

if [ "$HTTP_CODE" = "409" ]; then
  echo "    API key already exists (conflict), using provided key"
  API_KEY_A="test-api-key-a-12345678901234567890"
elif [ -z "$API_KEY_A" ]; then
  echo "    Failed to create API key (HTTP $HTTP_CODE)"
  API_KEY_A="test-api-key-a-12345678901234567890"
fi

echo "    API Key A: $API_KEY_A"

# Create JWT credential for Tenant A
echo "    Creating JWT credential for test-tenant-a"
JWT_SECRET_A="secret-key-for-tenant-a-do-not-use-in-production"
curl -s -X POST "$KONG_ADMIN_URL/consumers/test-tenant-a/jwt" \
  --data-urlencode "key=test-tenant-a" \
  --data-urlencode "secret=$JWT_SECRET_A" \
  --data-urlencode "algorithm=HS256" \
  2>/dev/null || echo "JWT credential may already exist"
echo "    JWT Secret A: $JWT_SECRET_A"

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
API_KEY_BODY=$(echo "$API_KEY_RESPONSE" | head -n -1)
API_KEY_B=$(echo "$API_KEY_BODY" | grep -o '"key":"[^"]*' | head -1 | cut -d'"' -f4)

if [ "$HTTP_CODE" = "409" ]; then
  echo "    API key already exists (conflict), using provided key"
  API_KEY_B="test-api-key-b-98765432109876543210"
elif [ -z "$API_KEY_B" ]; then
  echo "    Failed to create API key (HTTP $HTTP_CODE)"
  API_KEY_B="test-api-key-b-98765432109876543210"
fi

echo "    API Key B: $API_KEY_B"

# Create JWT credential for Tenant B
echo "    Creating JWT credential for test-tenant-b"
JWT_SECRET_B="secret-key-for-tenant-b-do-not-use-in-production"
curl -s -X POST "$KONG_ADMIN_URL/consumers/test-tenant-b/jwt" \
  --data-urlencode "key=test-tenant-b" \
  --data-urlencode "secret=$JWT_SECRET_B" \
  --data-urlencode "algorithm=HS256" \
  2>/dev/null || echo "JWT credential may already exist"
echo "    JWT Secret B: $JWT_SECRET_B"

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
API_KEY_BODY=$(echo "$API_KEY_RESPONSE" | head -n -1)
API_KEY_C=$(echo "$API_KEY_BODY" | grep -o '"key":"[^"]*' | head -1 | cut -d'"' -f4)

if [ "$HTTP_CODE" = "409" ]; then
  echo "    API key already exists (conflict), using provided key"
  API_KEY_C="test-api-key-c-11111111111111111111"
elif [ -z "$API_KEY_C" ]; then
  echo "    Failed to create API key (HTTP $HTTP_CODE)"
  API_KEY_C="test-api-key-c-11111111111111111111"
fi

echo "    API Key C: $API_KEY_C"

# Create JWT credential for Tenant C
echo "    Creating JWT credential for test-tenant-c"
JWT_SECRET_C="secret-key-for-tenant-c-do-not-use-in-production"
curl -s -X POST "$KONG_ADMIN_URL/consumers/test-tenant-c/jwt" \
  --data-urlencode "key=test-tenant-c" \
  --data-urlencode "secret=$JWT_SECRET_C" \
  --data-urlencode "algorithm=HS256" \
  2>/dev/null || echo "JWT credential may already exist"
echo "    JWT Secret C: $JWT_SECRET_C"

echo ""
echo "✅ Kong seeding complete!"
echo ""
echo "Test credentials (API Key Flow):"
echo "  Tenant A: username=test-tenant-a, api_key=test-api-key-a-12345678901234567890"
echo "  Tenant B: username=test-tenant-b, api_key=test-api-key-b-98765432109876543210"
echo "  Tenant C: username=test-tenant-c, api_key=test-api-key-c-11111111111111111111"
echo ""
echo "Test credentials (JWT Flow):"
echo "  Tenant A: key=test-tenant-a, secret=secret-key-for-tenant-a-do-not-use-in-production"
echo "  Tenant B: key=test-tenant-b, secret=secret-key-for-tenant-b-do-not-use-in-production"
echo "  Tenant C: key=test-tenant-c, secret=secret-key-for-tenant-c-do-not-use-in-production"
echo ""
echo "Test a request (API Key):"
echo "  curl -H 'apikey: test-api-key-a-12345678901234567890' http://localhost:8000/api/health"
echo ""
echo "Test a request (JWT):"
echo "  See Postman collection for JWT generation and testing"
