#!/bin/bash
set -e

NAMESPACE="f6bc3f-dev"
RELEASE_NAME="grafana"

echo "🚀 Deploying Grafana to ${NAMESPACE}..."
echo ""

# Create admin credentials secret
echo "📝 Step 1/6: Creating admin credentials secret..."
oc apply -f secret.yaml
echo ""

# Create network policy to allow ingress traffic
echo "🔒 Step 2/6: Creating network policy..."
oc apply -f networkpolicy.yaml
echo ""

# Add Grafana Helm repository
echo "📦 Step 3/6: Adding Helm repository..."
helm repo add grafana https://grafana.github.io/helm-charts 2>/dev/null || true
helm repo update
echo ""

# Deploy Grafana with minimal configuration (without --wait, will patch next)
echo "🎯 Step 4/6: Installing Grafana Helm chart..."
helm upgrade --install ${RELEASE_NAME} grafana/grafana \
  --namespace ${NAMESPACE} \
  --values values-minimal.yaml \
  --timeout 1m 2>&1 || echo "Helm install initiated (patching security context next)"
echo ""

# Patch deployment to fix OpenShift SCC compatibility
# The Grafana Helm chart sets UID 472 by default, but OpenShift requires dynamic UID assignment
echo "🔧 Step 5/6: Patching deployment for OpenShift SCC compatibility..."
echo "   Removing hardcoded UID/GID to allow OpenShift to assign them..."
oc patch deployment grafana -n ${NAMESPACE} --type=json -p='[
  {"op": "remove", "path": "/spec/template/spec/securityContext/runAsUser"},
  {"op": "remove", "path": "/spec/template/spec/securityContext/runAsGroup"},
  {"op": "remove", "path": "/spec/template/spec/securityContext/fsGroup"}
]'
echo ""

# Wait for deployment to be ready
echo "⏳ Waiting for Grafana pod to be ready..."
oc wait --for=condition=available --timeout=120s deployment/grafana -n ${NAMESPACE}
echo ""

# Create route if it doesn't exist
echo "🌐 Step 6/6: Ensuring route exists..."
oc create route edge grafana --service=grafana --port=service -n ${NAMESPACE} 2>/dev/null || echo "   Route already exists"
echo ""

# Get route URL and credentials
GRAFANA_URL=$(oc get route grafana -n ${NAMESPACE} -o jsonpath='{.spec.host}')
ADMIN_PASSWORD=$(oc get secret grafana-admin-credentials -n ${NAMESPACE} -o jsonpath="{.data.admin-password}" | base64 --decode)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Grafana deployed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Access Information:"
echo "   URL: https://${GRAFANA_URL}"
echo "   Username: admin"
echo "   Password: ${ADMIN_PASSWORD}"
echo ""
echo "📊 Deployment Status:"
oc get pods -n ${NAMESPACE} -l app.kubernetes.io/name=grafana
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Next Steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Access Grafana at: https://${GRAFANA_URL}"
echo "2. Login with username 'admin' and the password above"
echo "3. Go to Explore → Loki datasource (pre-configured)"
echo "4. Query logs: {namespace=\"${NAMESPACE}\", app=\"common-notify\"}"
echo ""
echo "💡 Tip: The Loki datasource is already configured at:"
echo "   http://loki.${NAMESPACE}.svc.cluster.local:3100"
echo ""
