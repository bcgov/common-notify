#!/bin/bash
set -e

# Product Configuration Generator
# Generates the shared Product configuration that defines all environments
#
# Usage:
#   ./generate-product-config.sh
#
# This script generates the Product, DraftDataset, and CredentialIssuers
# that are shared across all environments. This config should be applied
# once before any environment-specific configs.

# Get script directory (scripts/ is inside api-gateway/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/config/product.env"
TEMPLATE_FILE="${SCRIPT_DIR}/templates/product.yaml"
OUTPUT_FILE="${SCRIPT_DIR}/generated/gw-product.yaml"

# Validate files exist
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: Environment file not found: $ENV_FILE"
  exit 1
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "Error: Template file not found: $TEMPLATE_FILE"
  exit 1
fi

# Create generated directory if it doesn't exist
mkdir -p "${SCRIPT_DIR}/generated"

# Load environment variables
echo "Loading environment variables from: $ENV_FILE"
set -a  # Automatically export all variables
source "$ENV_FILE"
set +a

# Generate config from template
echo "Generating product configuration..."
echo "  Gateway ID: $GATEWAY_ID"
echo "  Output: $OUTPUT_FILE"

# Use envsubst to substitute environment variables in template
envsubst < "$TEMPLATE_FILE" > "$OUTPUT_FILE"

echo "✅ Product configuration generated successfully!"
echo "   File: $OUTPUT_FILE"
echo ""
echo "ℹ️  This configuration should be applied ONCE before environment-specific configs:"
echo "   gwa config set gateway $GATEWAY_ID"
echo "   gwa apply -i $OUTPUT_FILE"
