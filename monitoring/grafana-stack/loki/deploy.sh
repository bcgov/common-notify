#!/bin/bash
set -e

NAMESPACE="f6bc3f-dev"
RELEASE_NAME="loki"

echo "🚀 Deploying Grafana Loki to ${NAMESPACE}..."
echo ""

# Create network policy to allow ingress traffic
echo "🔒 Creating network policy for Loki..."
oc apply -f networkpolicy.yaml
echo ""

# Add Grafana Helm repository
echo "📦 Adding Helm repository..."
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
echo ""

# Deploy Loki
helm upgrade --install ${RELEASE_NAME} grafana/loki \
  --namespace ${NAMESPACE} \
  --values values.yaml \
  --set loki.schemaConfig.configs[0].from=2024-01-01 \
  --set loki.schemaConfig.configs[0].store=tsdb \
  --set loki.schemaConfig.configs[0].object_store=filesystem \
  --set loki.schemaConfig.configs[0].schema=v13 \
  --set loki.schemaConfig.configs[0].index.prefix=loki_index_ \
  --set loki.schemaConfig.configs[0].index.period=24h \
  --wait \
  --timeout 5m

echo "✅ Loki deployed successfully!"
echo ""
echo "📊 Check status:"
echo "  kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/name=loki"
echo ""
echo "🔍 View logs:"
echo "  kubectl logs -n ${NAMESPACE} -l app.kubernetes.io/name=loki -f"
echo ""
echo "🌐 Loki endpoint:"
echo "  http://loki.${NAMESPACE}.svc.cluster.local:3100"
