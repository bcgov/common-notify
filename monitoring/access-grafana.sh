#!/bin/bash
set -e

NAMESPACE="f6bc3f-dev"
GRAFANA_URL="https://grafana-f6bc3f-dev.apps.silver.devops.gov.bc.ca"

echo "🔍 Checking Grafana deployment status..."
echo ""

# Check if Grafana pod is running
GRAFANA_POD=$(kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$GRAFANA_POD" ]; then
  echo "❌ Grafana pod not found in namespace ${NAMESPACE}"
  echo ""
  echo "Deploy the monitoring stack first:"
  echo "  cd monitoring && ./deploy-all.sh"
  exit 1
fi

# Check pod status
POD_STATUS=$(kubectl get pod ${GRAFANA_POD} -n ${NAMESPACE} -o jsonpath='{.status.phase}')
echo "📦 Grafana pod: ${GRAFANA_POD}"
echo "📊 Status: ${POD_STATUS}"
echo ""

if [ "$POD_STATUS" != "Running" ]; then
  echo "⏳ Grafana is not ready yet. Current status: ${POD_STATUS}"
  echo ""
  echo "Check logs:"
  echo "  kubectl logs -n ${NAMESPACE} ${GRAFANA_POD} -f"
  exit 1
fi

# Check if route exists
ROUTE_HOST=$(kubectl get route grafana -n ${NAMESPACE} -o jsonpath='{.spec.host}' 2>/dev/null || echo "")

if [ -z "$ROUTE_HOST" ]; then
  echo "⚠️  Route not found. The deployment script should create it automatically."
  echo ""
  echo "To create the route manually:"
  echo "  oc create route edge grafana --service=grafana --port=80 -n ${NAMESPACE}"
  echo ""
  echo "Check routes:"
  echo "  kubectl get routes -n ${NAMESPACE}"
  exit 1
fi

echo "✅ Grafana is ready!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Access Information"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Grafana URL:"
echo "   ${GRAFANA_URL}"
echo ""
echo "👤 Username:"
echo "   admin"
echo ""
echo "🔐 Password:"
ADMIN_PASSWORD=$(kubectl get secret --namespace ${NAMESPACE} grafana-admin-credentials -o jsonpath="{.data.admin-password}" | base64 --decode)
echo "   ${ADMIN_PASSWORD}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📖 Next Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Open the URL above in your browser"
echo ""
echo "2. Login with username 'admin' and the password shown above"
echo ""
echo "3. Import the notification logs dashboard:"
echo "   - Click 'Dashboards' → 'Import'"
echo "   - Upload: monitoring/dashboards/notification-logs.json"
echo "   - Click 'Import'"
echo ""
echo "4. Start exploring logs:"
echo "   - Click 'Explore' (compass icon)"
echo "   - Select 'Loki' datasource"
echo "   - Try query: {namespace=\"f6bc3f-dev\", app=\"common-notify\"}"
echo ""
echo "5. View the dashboard:"
echo "   - Click 'Dashboards' → 'Common Notify' → 'Notification Logs'"
echo ""
