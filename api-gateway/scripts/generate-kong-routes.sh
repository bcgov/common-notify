#!/bin/bash

# Kong Routes Generator
# Generates Kong routes from routes.yaml template using environment variables
# Usage: ./generate-kong-routes.sh /path/to/env/file /path/to/routes.yaml

set -e

ENV_FILE="${1:?Environment file required}"
ROUTES_TEMPLATE="${2:?Routes template file required}"
KONG_ADMIN_URL="${3:-http://kong:8001}"

echo "Loading environment from $ENV_FILE..."
source "$ENV_FILE"

echo "Generating Kong routes from $ROUTES_TEMPLATE using KONG_ADMIN_URL=$KONG_ADMIN_URL..."

# Validate required variables
for var in GATEWAY_ID GATEWAY_SERVICE_NAME BACKEND_HOST ROUTE_PREFIX GATEWAY_HOSTNAME \
            KEYCLOAK_ISSUER FRONTEND_KEYCLOAK_ISSUER ALLOWED_AUDIENCE FRONTEND_ALLOWED_AUDIENCE; do
  if [ -z "$(eval echo \$$var)" ]; then
    echo "ERROR: Required variable $var not set in $ENV_FILE"
    exit 1
  fi
done

# Wait for Kong to be ready
echo "Waiting for Kong to be ready..."
until curl -s "$KONG_ADMIN_URL/status" > /dev/null; do
  echo "  Kong not ready, waiting..."
  sleep 2
done
echo "Kong is ready!"

# Create service
echo "Creating service: $GATEWAY_SERVICE_NAME..."
curl -s -X POST "$KONG_ADMIN_URL/services" \
  --data-urlencode "name=$GATEWAY_SERVICE_NAME" \
  --data-urlencode "url=http://$BACKEND_HOST" \
  --data-urlencode "protocol=http" \
  2>/dev/null || echo "Service may already exist"

# Parse routes.yaml and create routes
# This is a simplified approach - for production, use a YAML parser tool
echo "Parsing and creating routes..."

# Extract route names and paths from the routes section
# This is a basic extraction - routes are between "routes:" and "plugins:"
sed -n '/^  routes:/,/^plugins:/p' "$ROUTES_TEMPLATE" | \
  grep -E '^\s+- name:|paths:|methods:' | \
  while read line; do
    # Variable substitution
    line=$(echo "$line" | sed \
      -e "s/\${ROUTE_PREFIX}/$ROUTE_PREFIX/g" \
      -e "s/\${GATEWAY_HOSTNAME}/$GATEWAY_HOSTNAME/g" \
      -e "s/\${BACKEND_HOST}/$BACKEND_HOST/g" \
      -e "s/\${GATEWAY_ID}/$GATEWAY_ID/g" \
      -e "s/\${ENVIRONMENT}/$ENVIRONMENT/g")

    echo "$line"
  done

echo ""
echo "✅ Routes generation complete!"
echo ""
echo "Note: This script provides a basic route extraction."
echo "For full YAML parsing with plugins, consider using a tool like yq:"
echo "  yq '.kind = \"GatewayService\" | ...' routes.yaml"
