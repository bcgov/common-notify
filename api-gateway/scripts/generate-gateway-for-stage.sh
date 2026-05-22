#!/bin/bash
set -e

# Stateful Gateway Configuration Generator
# Generates gateway configs based on which environments should be active
#
# Usage:
#   ./generate-gateway-for-stage.sh dev                    # Generate config for DEV only
#   ./generate-gateway-for-stage.sh test                   # Generate config for DEV+TEST
#   ./generate-gateway-for-stage.sh prod                   # Generate config for DEV+TEST+PROD
#   ./generate-gateway-for-stage.sh pr <release-name>      # Generate config for DEV+TEST+PROD+PR

STAGE=$1
RELEASE_NAME=$2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/generated/gw-active-services.yaml"

case "$STAGE" in
  dev)
    echo "Generating gateway config for: DEV only"
    echo ""
    echo "⚠️  This will DELETE TEST and PROD gateway routes!"
    echo ""

    # Generate DEV only
    bash "${SCRIPT_DIR}/scripts/generate-gateway-config.sh" dev

    # Copy to active services file
    cp "${SCRIPT_DIR}/generated/gw-routes-dev.yaml" "$OUTPUT_FILE"

    echo "✅ Active services: DEV"
    echo "   Output: gw-active-services.yaml"
    ;;

  test)
    echo "Generating gateway config for: DEV + TEST"
    echo ""
    echo "⚠️  This will DELETE PROD gateway routes!"
    echo ""

    # Generate both DEV and TEST
    bash "${SCRIPT_DIR}/scripts/generate-gateway-config.sh" dev
    bash "${SCRIPT_DIR}/scripts/generate-gateway-config.sh" test

    # Combine DEV and TEST
    cat "${SCRIPT_DIR}/generated/gw-routes-dev.yaml" > "$OUTPUT_FILE"
    echo "---" >> "$OUTPUT_FILE"
    cat "${SCRIPT_DIR}/generated/gw-routes-test.yaml" >> "$OUTPUT_FILE"

    echo "✅ Active services: DEV + TEST"
    echo "   Output: gw-active-services.yaml"
    ;;

  prod)
    echo "Generating gateway config for: DEV + TEST + PROD"
    echo ""

    # Generate all three
    bash "${SCRIPT_DIR}/scripts/generate-gateway-config.sh" all

    # Use the combined file
    cp "${SCRIPT_DIR}/generated/gw-services-all.yaml" "$OUTPUT_FILE"

    echo "✅ Active services: DEV + TEST + PROD"
    echo "   Output: gw-active-services.yaml"
    ;;

  pr)
    if [ -z "$RELEASE_NAME" ]; then
      echo "Error: Release name required for PR config"
      echo "Usage: $0 pr <release-name>"
      exit 1
    fi

    echo "Generating gateway config for: DEV + TEST + PROD + PR"
    echo ""

    # Generate all including PR
    bash "${SCRIPT_DIR}/scripts/generate-gateway-config.sh" pr-with-permanent "$RELEASE_NAME"

    # Use the PR with permanent file
    cp "${SCRIPT_DIR}/generated/gw-services-pr-with-permanent.yaml" "$OUTPUT_FILE"

    echo "✅ Active services: DEV + TEST + PROD + PR-${RELEASE_NAME}"
    echo "   Output: gw-active-services.yaml"
    ;;

  *)
    echo "Error: Invalid stage"
    echo ""
    echo "Usage:"
    echo "  $0 dev                    # Apply to DEV only (removes TEST/PROD)"
    echo "  $0 test                   # Apply to DEV+TEST (removes PROD)"
    echo "  $0 prod                   # Apply to DEV+TEST+PROD"
    echo "  $0 pr <release-name>      # Apply to DEV+TEST+PROD+PR"
    exit 1
    ;;
esac

echo ""
echo "Ready to apply: $OUTPUT_FILE"
echo ""
