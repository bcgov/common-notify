#!/bin/bash
set -e

NAMESPACE="f6bc3f-dev"
RELEASE_NAME="mimir"

echo "🚀 Deploying Grafana Mimir to ${NAMESPACE}..."

# Add Grafana Helm repository
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Deploy Mimir
helm upgrade --install ${RELEASE_NAME} grafana/mimir-distributed \
  --namespace ${NAMESPACE} \
  --create-namespace \
  --values values.yaml \
  --wait \
  --timeout 5m

echo "✅ Mimir deployed successfully!"
echo ""
echo "📊 Check status:"
echo "  kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/name=mimir"
echo ""
echo "🔍 View logs:"
echo "  kubectl logs -n ${NAMESPACE} -l app.kubernetes.io/name=mimir -f"
echo ""
echo "🌐 Mimir endpoint:"
echo "  http://mimir.${NAMESPACE}.svc.cluster.local:9009/prometheus"
