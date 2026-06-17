#!/bin/bash
set -e

TOOLS_NAMESPACE="f6bc3f-dev"
DEV_NAMESPACE="f6bc3f-dev"

echo "🚀 Deploying Common Notify Monitoring Stack"
echo "============================================"
echo ""

# Step 1: Deploy Loki
echo "📦 Step 1/4: Deploying Loki (Log Aggregation)..."
cd grafana-stack/loki
./deploy.sh
cd ../..
echo ""

# Step 2: Deploy Grafana
echo "📊 Step 2/4: Deploying Grafana (Visualization)..."
cd grafana-stack/grafana
./deploy.sh
cd ../..
echo ""

# Step 3: Deploy Mimir (optional - for metrics)
echo "📈 Step 3/4: Deploying Mimir (Metrics Storage)..."
cd grafana-stack/mimir
./deploy.sh
cd ../..
echo ""

# Step 4: Deploy Grafana Agent
echo "🤖 Step 4/4: Deploying Grafana Agent (Log Collection)..."
cd grafana-stack/grafana-agent
./deploy.sh
cd ../..
echo ""

echo "✅ Monitoring stack deployed successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Access Grafana Web Interface"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Run this script to get access details:"
echo "   ./access-grafana.sh"
echo ""
echo "Or access directly:"
echo "   URL: https://grafana-f6bc3f-dev.apps.silver.devops.gov.bc.ca"
echo "   Username: admin"
echo ""
echo "Get password:"
echo "   kubectl get secret --namespace ${TOOLS_NAMESPACE} grafana-admin-credentials -o jsonpath=\"{.data.admin-password}\" | base64 --decode ; echo"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Next Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Import dashboard in Grafana:"
echo "   - Go to Dashboards → Import"
echo "   - Upload: monitoring/dashboards/notification-logs.json"
echo ""
echo "2. Verify Loki is receiving logs:"
echo "   - In Grafana, go to Explore"
echo "   - Select Loki datasource"
echo "   - Query: {namespace=\"${DEV_NAMESPACE}\", app=\"common-notify\"}"
echo ""
echo "3. Check component status:"
echo "   kubectl get pods -n ${TOOLS_NAMESPACE} -l app.kubernetes.io/name=loki"
echo "   kubectl get pods -n ${TOOLS_NAMESPACE} -l app.kubernetes.io/name=grafana"
echo "   kubectl get pods -n ${TOOLS_NAMESPACE} -l app.kubernetes.io/name=mimir"
echo "   kubectl get pods -n ${DEV_NAMESPACE} -l app=grafana-agent"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
