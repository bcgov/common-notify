#!/bin/bash
set -e

# Gateway Configuration Generator
# Generates environment-specific gateway configurations from template
#
# Usage:
#   ./generate-config.sh <environment> [release-name]
#
# Arguments:
#   environment   - Environment name (dev, test, prod)
#   release-name  - Optional release name (defaults to common-notify-{env})
#                   For PRs, use: common-notify-${PR_NUMBER}
#
# Examples:
#   ./generate-config.sh dev                    # Dedicated DEV deployment
#   ./generate-config.sh dev common-notify-6    # PR #6 deployment
#   ./generate-config.sh test                   # TEST deployment
#   ./generate-config.sh prod                   # PROD deployment

ENVIRONMENT=$1
RELEASE_NAME=$2

# Validate environment argument
if [ -z "$ENVIRONMENT" ]; then
  echo "Error: Environment argument is required"
  echo "Usage: $0 <environment> [release-name]"
  echo "Example: $0 dev common-notify-6"
  exit 1
fi

# Validate environment value
if [[ ! "$ENVIRONMENT" =~ ^(pr|dev|test|prod)$ ]]; then
  echo "Error: Environment must be one of: pr, dev, test, prod"
  exit 1
fi

# Set default release name if not provided
if [ -z "$RELEASE_NAME" ]; then
  RELEASE_NAME="common-notify-${ENVIRONMENT}"
fi

# Get script directory (scripts/ is inside api-gateway/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/config/${ENVIRONMENT}.env"
TEMPLATE_FILE="${SCRIPT_DIR}/templates/routes.yaml"
OUTPUT_FILE="${SCRIPT_DIR}/generated/gw-routes-${ENVIRONMENT}.yaml"

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

# Export RELEASE_NAME so it's available to envsubst
export RELEASE_NAME

# Load environment variables
echo "Loading environment variables from: $ENV_FILE"
set -a  # Automatically export all variables
source "$ENV_FILE"
set +a

# Generate config from template
echo "Generating gateway config..."
echo "  Environment: $ENVIRONMENT"
echo "  Release Name: $RELEASE_NAME"
echo "  Backend Host: $(eval echo $BACKEND_HOST)"
echo "  Output: $OUTPUT_FILE"

# Use envsubst to substitute environment variables in template
envsubst < "$TEMPLATE_FILE" > "$OUTPUT_FILE"

echo "✅ Gateway configuration generated successfully!"
echo "   File: $OUTPUT_FILE"
