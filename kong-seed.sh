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
  --data-urlencode "strip_path=true" \
  2>/dev/null || echo "Route may already exist"

# Enable key-auth plugin on service (if not exists)
echo "Enabling key-auth plugin..."
curl -s -X POST "$KONG_ADMIN_URL/services/notify/plugins" \
  --data-urlencode "name=key-auth" \
  2>/dev/null || echo "Plugin may already exist"

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
API_KEY_A=$(curl -s -X POST "$KONG_ADMIN_URL/consumers/test-tenant-a/key-auth" \
  --data-urlencode "key=test-api-key-a-12345678901234567890" \
  2>/dev/null | grep -o '"key":"[^"]*' | head -1 | cut -d'"' -f4)

echo "    API Key A: $API_KEY_A"

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
API_KEY_B=$(curl -s -X POST "$KONG_ADMIN_URL/consumers/test-tenant-b/key-auth" \
  --data-urlencode "key=test-api-key-b-98765432109876543210" \
  2>/dev/null | grep -o '"key":"[^"]*' | head -1 | cut -d'"' -f4)

echo "    API Key B: $API_KEY_B"

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
API_KEY_C=$(curl -s -X POST "$KONG_ADMIN_URL/consumers/test-tenant-c/key-auth" \
  --data-urlencode "key=test-api-key-c-11111111111111111111" \
  2>/dev/null | grep -o '"key":"[^"]*' | head -1 | cut -d'"' -f4)

echo "    API Key C: $API_KEY_C"

echo ""
echo "✅ Kong seeding complete!"
echo ""
echo "Test credentials:"
echo "  Tenant A: username=test-tenant-a, api_key=test-api-key-a-12345678901234567890"
echo "  Tenant B: username=test-tenant-b, api_key=test-api-key-b-98765432109876543210"
echo "  Tenant C: username=test-tenant-c, api_key=test-api-key-c-11111111111111111111"
echo ""
echo "Test a request:"
echo "  curl -H 'apikey: test-api-key-a-12345678901234567890' http://localhost:8000/api/health"
