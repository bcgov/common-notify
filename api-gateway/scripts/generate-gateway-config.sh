#!/bin/bash
set -e

# Unified Gateway Configuration Generator
#
# Usage:
#   ./generate-gateway-config.sh product                        # Generate Product config only
#   ./generate-gateway-config.sh pr <release-name>              # Generate PR routes only
#   ./generate-gateway-config.sh all                            # Generate Product + all services (dev+test+prod)
#   ./generate-gateway-config.sh pr-with-permanent <release>    # Generate PR + permanent services (dev+test+prod+PR)

COMMAND=$1
RELEASE_NAME=$2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Function to generate a single environment config
generate_env_config() {
  local env=$1
  local release=$2

  local ENV_FILE="${SCRIPT_DIR}/config/${env}.env"
  local TEMPLATE_FILE="${SCRIPT_DIR}/templates/routes.yaml"
  local OUTPUT_FILE="${SCRIPT_DIR}/generated/gw-routes-${env}.yaml"

  # Set default release name if not provided
  if [ -z "$release" ]; then
    release="common-notify-${env}"
  fi

  # For PR environment, extract PR number
  if [ "$env" == "pr" ]; then
    PR_NUMBER=$(echo "$release" | sed 's/common-notify-//')
    export PR_NUMBER
  fi

  # Load environment variables
  export RELEASE_NAME=$release
  export ENVIRONMENT=$env
  set -a
  source "$ENV_FILE"
  set +a

  # Generate config from template
  mkdir -p "${SCRIPT_DIR}/generated"
  envsubst < "$TEMPLATE_FILE" > "$OUTPUT_FILE"

  # For PR environments, remove Product/Dataset sections
  if [ "$env" == "pr" ]; then
    TMP_FILE="${OUTPUT_FILE}.tmp"
    sed '/^kind: DraftDataset$/,/^kind: GatewayService$/{ /^kind: GatewayService$/!d; }' "$OUTPUT_FILE" > "$TMP_FILE"
    sed -i.bak '/^kind: CredentialIssuer$/,$d' "$TMP_FILE" && rm -f "$TMP_FILE.bak"
    sed -i.bak '/^---$/d' "$TMP_FILE" && rm -f "$TMP_FILE.bak"
    mv "$TMP_FILE" "$OUTPUT_FILE"
  fi

  echo "  ✓ Generated: gw-routes-${env}.yaml"
}

# Function to generate Product config
generate_product_config() {
  local ENV_FILE="${SCRIPT_DIR}/config/product.env"
  local TEMPLATE_FILE="${SCRIPT_DIR}/templates/product.yaml"
  local OUTPUT_FILE="${SCRIPT_DIR}/generated/gw-product.yaml"

  set -a
  source "$ENV_FILE"
  set +a

  mkdir -p "${SCRIPT_DIR}/generated"
  envsubst < "$TEMPLATE_FILE" > "$OUTPUT_FILE"

  echo "  ✓ Generated: gw-product.yaml"
}

# Main logic
case "$COMMAND" in
  product)
    echo "Generating Product configuration..."
    generate_product_config
    echo "✅ Done!"
    ;;

  pr)
    if [ -z "$RELEASE_NAME" ]; then
      echo "Error: Release name required for PR config"
      echo "Usage: $0 pr <release-name>"
      exit 1
    fi
    echo "Generating PR configuration..."
    generate_env_config "pr" "$RELEASE_NAME"
    echo "✅ Done!"
    ;;

  all)
    echo "Generating complete gateway configuration..."
    echo ""
    echo "1. Product config:"
    generate_product_config
    echo ""
    echo "2. Service configs:"
    generate_env_config "dev"
    generate_env_config "test"
    generate_env_config "prod"
    echo ""
    echo "3. Combined services file:"
    cat "${SCRIPT_DIR}/generated/gw-routes-dev.yaml" > "${SCRIPT_DIR}/generated/gw-services-all.yaml"
    echo "---" >> "${SCRIPT_DIR}/generated/gw-services-all.yaml"
    cat "${SCRIPT_DIR}/generated/gw-routes-test.yaml" >> "${SCRIPT_DIR}/generated/gw-services-all.yaml"
    echo "---" >> "${SCRIPT_DIR}/generated/gw-services-all.yaml"
    cat "${SCRIPT_DIR}/generated/gw-routes-prod.yaml" >> "${SCRIPT_DIR}/generated/gw-services-all.yaml"
    echo "  ✓ Generated: gw-services-all.yaml (dev+test+prod)"
    echo ""
    echo "✅ Complete! Ready to apply:"
    echo "   - gw-product.yaml (Product definition)"
    echo "   - gw-services-all.yaml (All environment services)"
    ;;

  pr-with-permanent)
    if [ -z "$RELEASE_NAME" ]; then
      echo "Error: Release name required for PR config"
      echo "Usage: $0 pr-with-permanent <release-name>"
      exit 1
    fi
    echo "Generating PR + permanent services configuration..."
    echo ""
    echo "1. Permanent service configs:"
    (generate_env_config "dev")
    (generate_env_config "test")
    (generate_env_config "prod")
    echo ""
    echo "2. PR service config:"
    (generate_env_config "pr" "$RELEASE_NAME")
    echo ""
    echo "3. Combined services file (dev+test+prod+PR):"
    cat "${SCRIPT_DIR}/generated/gw-routes-dev.yaml" > "${SCRIPT_DIR}/generated/gw-services-pr-with-permanent.yaml"
    echo "---" >> "${SCRIPT_DIR}/generated/gw-services-pr-with-permanent.yaml"
    cat "${SCRIPT_DIR}/generated/gw-routes-test.yaml" >> "${SCRIPT_DIR}/generated/gw-services-pr-with-permanent.yaml"
    echo "---" >> "${SCRIPT_DIR}/generated/gw-services-pr-with-permanent.yaml"
    cat "${SCRIPT_DIR}/generated/gw-routes-prod.yaml" >> "${SCRIPT_DIR}/generated/gw-services-pr-with-permanent.yaml"
    echo "---" >> "${SCRIPT_DIR}/generated/gw-services-pr-with-permanent.yaml"
    cat "${SCRIPT_DIR}/generated/gw-routes-pr.yaml" >> "${SCRIPT_DIR}/generated/gw-services-pr-with-permanent.yaml"
    echo "  ✓ Generated: gw-services-pr-with-permanent.yaml (dev+test+prod+PR)"
    echo ""
    echo "✅ Complete! Ready to apply:"
    echo "   - gw-services-pr-with-permanent.yaml (Adds PR without deleting permanent services)"
    ;;

  *)
    echo "Error: Invalid command"
    echo ""
    echo "Usage:"
    echo "  $0 product                        # Generate Product config"
    echo "  $0 pr <release-name>              # Generate PR routes only"
    echo "  $0 all                            # Generate Product + all services"
    echo "  $0 pr-with-permanent <release>    # Generate PR + permanent services"
    exit 1
    ;;
esac
