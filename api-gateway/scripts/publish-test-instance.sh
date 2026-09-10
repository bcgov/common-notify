#!/bin/bash
# Publish a raw Kong config (gwservice-to-kong.py output) to the APS test-instance gateway
# under one qualifier. Shared by pr-open, pr-close and merge; the production-instance
# gateway is still published inline in those workflows.
#
# Usage: publish-test-instance.sh <kong-config.yaml> <dev|test> [--dry-run]
#
# Needs GWA_ACCT_TEST_INSTANCE = {"client_id": "...", "client_secret": "..."} for a service
# account on the notify-test gateway holding GatewayConfig.Publish.
set -euo pipefail

FILE=${1:?kong config file required}
QUALIFIER=${2:?qualifier required (dev or test)}
DRY_RUN=${3:-}

HOST=api-gov-bc-ca.test.api.gov.bc.ca
GATEWAY=notify-test

case "$QUALIFIER" in dev|test) ;; *) echo "::error::qualifier must be dev or test, got '$QUALIFIER'"; exit 1 ;; esac
case "$DRY_RUN" in ""|--dry-run) ;; *) echo "::error::third argument must be --dry-run or empty"; exit 1 ;; esac

if [ -z "${GWA_ACCT_TEST_INSTANCE:-}" ]; then
  echo "::error::GWA_ACCT_TEST_INSTANCE is not set. Add a repository secret holding a notify-test service account with GatewayConfig.Publish."
  exit 1
fi

if ! CLIENT_ID=$(echo "$GWA_ACCT_TEST_INSTANCE" | jq -er '.client_id') ||
  ! CLIENT_SECRET=$(echo "$GWA_ACCT_TEST_INSTANCE" | jq -er '.client_secret'); then
  echo "::error::GWA_ACCT_TEST_INSTANCE must be JSON with client_id and client_secret."
  exit 1
fi
# The repository secret is created holding this placeholder until the real account exists.
if [ "$CLIENT_ID" = "REPLACE_ME" ] || [ "$CLIENT_SECRET" = "REPLACE_ME" ]; then
  echo "::error::GWA_ACCT_TEST_INSTANCE still holds its placeholder. Set the notify-test service account's client_id and client_secret."
  exit 1
fi

# --host on every call, never `gwa config set host`: on a laptop that setting persists and
# would send later production publishes to the test instance.
gwa login --host "$HOST" --client-id "$CLIENT_ID" --client-secret "$CLIENT_SECRET"

# A qualified publish is a full reconcile of that qualifier: whatever the file omits is deleted.
ARGS=(publish-gateway "$FILE" --host "$HOST" --gateway "$GATEWAY" --qualifier "$QUALIFIER")
if [ -n "$DRY_RUN" ]; then
  ARGS+=("$DRY_RUN")
fi
set +e
OUT=$(gwa "${ARGS[@]}" 2>&1)
STATUS=$?
set -e
echo "$OUT"

# gwa can exit 0 even when the publish is rejected.
if [ "$STATUS" -ne 0 ] || echo "$OUT" | grep -qiE "publish failed|Errors encountered|Rejecting request|Validation Errors|Sync Failed"; then
  echo "::error::gwa publish-gateway failed for ${GATEWAY} qualifier=${QUALIFIER}"
  exit 1
fi
