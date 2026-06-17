#!/bin/bash
set -e

NAMESPACE="f6bc3f-dev"

echo "🚀 Deploying Grafana Agent to ${NAMESPACE}..."

# Apply RBAC resources
kubectl apply -f rbac.yaml

# Apply ConfigMap
kubectl apply -f configmap.yaml

# Apply Deployment (single pod instead of DaemonSet for resource efficiency)
kubectl apply -f deployment.yaml

echo "✅ Grafana Agent deployed successfully!"
echo ""
echo "📊 Check status:"
echo "  kubectl get pods -n ${NAMESPACE} -l app=grafana-agent"
echo ""
echo "🔍 View logs:"
echo "  kubectl logs -n ${NAMESPACE} -l app=grafana-agent -f"
echo ""
echo "📝 The agent will collect logs from all pods with label 'app=common-notify'"
echo "   and forward them to Loki at: http://loki.f6bc3f-dev.svc.cluster.local:3100"
