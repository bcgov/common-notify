#!/bin/bash
set -e

echo "========================================"
echo "Deploying Loki to f6bc3f-tools"
echo "========================================"

# Add Grafana Helm repo
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Deploy Loki
helm upgrade --install loki grafana/loki \
  --namespace f6bc3f-tools \
  --values values-tools.yaml \
  --wait \
  --timeout 5m

echo ""
echo "Applying NetworkPolicies..."
oc apply -f networkpolicy-tools.yaml

echo ""
echo "✓ Loki deployed successfully to f6bc3f-tools!"
echo ""
echo "Verify:"
echo "  oc get pods -n f6bc3f-tools -l app.kubernetes.io/name=loki"
echo ""
echo "Test Loki API:"
echo "  oc port-forward -n f6bc3f-tools svc/loki 3100:3100"
echo "  curl http://localhost:3100/ready"
echo ""
