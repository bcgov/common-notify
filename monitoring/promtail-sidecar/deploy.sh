#!/bin/bash

set -e

NAMESPACE="f6bc3f-dev"
DEPLOYMENT="common-notify-dev-frontend"

echo "Deploying Promtail sidecar for frontend logs..."

# Create the ConfigMap
echo "Creating Promtail ConfigMap..."
oc apply -f config.yaml

# Patch the deployment
echo "Patching deployment with Promtail sidecar..."
oc patch deployment/${DEPLOYMENT} -n ${NAMESPACE} --type=strategic --patch-file=patch.yaml

echo "Waiting for rollout to complete..."
oc rollout status deployment/${DEPLOYMENT} -n ${NAMESPACE} --timeout=180s

echo "Promtail sidecar deployed successfully!"
echo ""
echo "To view frontend logs in Grafana, use the query:"
echo "  {job=\"common-notify-frontend\"}"
