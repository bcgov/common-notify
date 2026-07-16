#!/bin/bash
# Create OAuth secret for Grafana OpenShift authentication
# This script extracts the ServiceAccount token and creates a Kubernetes secret

set -e

NAMESPACE="f6bc3f-tools"
SERVICE_ACCOUNT="grafana"
SECRET_NAME="grafana-oauth-secret"

echo "Creating OAuth secret for Grafana..."

# Get the ServiceAccount token (using modern command)
echo "Extracting ServiceAccount token..."
TOKEN=$(oc create token ${SERVICE_ACCOUNT} -n ${NAMESPACE} --duration=8760h)

if [ -z "$TOKEN" ]; then
    echo "ERROR: Could not get ServiceAccount token"
    exit 1
fi

# Create the secret
echo "Creating secret ${SECRET_NAME}..."
oc create secret generic ${SECRET_NAME} \
  --from-literal=client-secret="${TOKEN}" \
  -n ${NAMESPACE} \
  --dry-run=client -o yaml | oc apply -f -

echo "✓ OAuth secret created successfully!"
echo ""
echo "Next step: Redeploy Grafana to pick up the OAuth configuration"
