#!/bin/bash
set -e

NAMESPACE="f6bc3f-dev"

echo "🚀 Deploying Promtail to ${NAMESPACE}..."

# Apply RBAC resources
kubectl apply -f rbac.yaml

# Apply ConfigMap
kubectl apply -f configmap.yaml

# Apply Deployment
kubectl apply -f deployment.yaml

echo "✅ Promtail deployed successfully!"
echo ""
echo "📊 Check status:"
echo "  kubectl get pods -n ${NAMESPACE} -l app=promtail"
echo ""
echo "🔍 View logs:"
echo "  kubectl logs -n ${NAMESPACE} -l app=promtail -f"
echo ""
echo "📝 Promtail will collect logs from all pods with label matching 'common-notify-.*'"
echo "   and forward them to Loki at: http://loki.f6bc3f-dev.svc.cluster.local:3100"
