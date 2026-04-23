#!/bin/bash
set -e

# All Services Configuration Generator
# Generates a combined config with ALL environment services (dev, test, prod)
# This prevents gwa apply from deleting services not in the file

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/generated/gw-services-all.yaml"

# Create generated directory if it doesn't exist
mkdir -p "${SCRIPT_DIR}/generated"

echo "Generating combined services configuration..."

# Generate each environment's config
"${SCRIPT_DIR}/scripts/generate-config.sh" dev common-notify-dev
"${SCRIPT_DIR}/scripts/generate-config.sh" test common-notify-test
"${SCRIPT_DIR}/scripts/generate-config.sh" prod common-notify-prod

# Combine all three into one file
cat "${SCRIPT_DIR}/generated/gw-routes-dev.yaml" > "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
cat "${SCRIPT_DIR}/generated/gw-routes-test.yaml" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
cat "${SCRIPT_DIR}/generated/gw-routes-prod.yaml" >> "$OUTPUT_FILE"

echo "✅ Combined services configuration generated!"
echo "   File: $OUTPUT_FILE"
echo "   Contains: DEV + TEST + PROD services"
