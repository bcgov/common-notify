#!/bin/bash
# Deploy Grafana dashboards and Loki alert rules to f6bc3f-tools namespace
# This script creates ConfigMaps for dashboards and applies alert rules to Loki

set -e

NAMESPACE="f6bc3f-tools"
DASHBOARD_DIR="./dashboards"
ALERT_RULES_FILE="./grafana-stack/loki/alert-rules.yaml"

echo "=========================================="
echo "Deploying Dashboards and Alert Rules"
echo "Namespace: $NAMESPACE"
echo "=========================================="

# Check if logged into OpenShift
if ! oc whoami &> /dev/null; then
    echo "ERROR: Not logged into OpenShift. Please login first using:"
    echo "  oc login --token=<token> --server=https://api.silver.devops.gov.bc.ca:6443"
    exit 1
fi

# Verify namespace exists
if ! oc get namespace "$NAMESPACE" &> /dev/null; then
    echo "ERROR: Namespace $NAMESPACE does not exist"
    exit 1
fi

echo ""
echo "Step 1: Creating ConfigMaps for Grafana Dashboards"
echo "---------------------------------------------------"

# Create ConfigMap for DEV dashboard
if [ -f "$DASHBOARD_DIR/dev-environment.json" ]; then
    echo "Creating ConfigMap for DEV environment dashboard..."
    oc create configmap grafana-dashboard-dev \
        --from-file=dev-environment.json="$DASHBOARD_DIR/dev-environment.json" \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | oc apply -f -

    # Add label for Grafana sidecar to pick it up
    oc label configmap grafana-dashboard-dev \
        grafana_dashboard=1 \
        -n "$NAMESPACE" \
        --overwrite

    echo "✓ DEV dashboard ConfigMap created"
else
    echo "WARNING: DEV dashboard file not found at $DASHBOARD_DIR/dev-environment.json"
fi

# Create ConfigMap for TEST dashboard
if [ -f "$DASHBOARD_DIR/test-environment.json" ]; then
    echo "Creating ConfigMap for TEST environment dashboard..."
    oc create configmap grafana-dashboard-test \
        --from-file=test-environment.json="$DASHBOARD_DIR/test-environment.json" \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | oc apply -f -

    # Add label for Grafana sidecar to pick it up
    oc label configmap grafana-dashboard-test \
        grafana_dashboard=1 \
        -n "$NAMESPACE" \
        --overwrite

    echo "✓ TEST dashboard ConfigMap created"
else
    echo "WARNING: TEST dashboard file not found at $DASHBOARD_DIR/test-environment.json"
fi

# Create ConfigMap for PROD dashboard
if [ -f "$DASHBOARD_DIR/prod-environment.json" ]; then
    echo "Creating ConfigMap for PROD environment dashboard..."
    oc create configmap grafana-dashboard-prod \
        --from-file=prod-environment.json="$DASHBOARD_DIR/prod-environment.json" \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | oc apply -f -

    # Add label for Grafana sidecar to pick it up
    oc label configmap grafana-dashboard-prod \
        grafana_dashboard=1 \
        -n "$NAMESPACE" \
        --overwrite

    echo "✓ PROD dashboard ConfigMap created"
else
    echo "WARNING: PROD dashboard file not found at $DASHBOARD_DIR/prod-environment.json"
fi

echo ""
echo "Step 2: Deploying Loki Alert Rules"
echo "-----------------------------------"

if [ -f "$ALERT_RULES_FILE" ]; then
    echo "Creating ConfigMap for Loki alert rules..."
    oc create configmap loki-alert-rules \
        --from-file=alert-rules.yaml="$ALERT_RULES_FILE" \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | oc apply -f -

    echo "✓ Alert rules ConfigMap created"
    echo ""
    echo "NOTE: You need to configure Loki to load these rules."
    echo "Update Loki values.yaml to mount this ConfigMap:"
    echo ""
    echo "  extraVolumes:"
    echo "    - name: alert-rules"
    echo "      configMap:"
    echo "        name: loki-alert-rules"
    echo ""
    echo "  extraVolumeMounts:"
    echo "    - name: alert-rules"
    echo "      mountPath: /etc/loki/rules/common-notify"
    echo "      readOnly: true"
    echo ""
else
    echo "ERROR: Alert rules file not found at $ALERT_RULES_FILE"
    exit 1
fi

echo ""
echo "Step 3: Restarting Grafana to load dashboards"
echo "----------------------------------------------"

# Find Grafana deployment
GRAFANA_DEPLOYMENT=$(oc get deployment -n "$NAMESPACE" -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -n "$GRAFANA_DEPLOYMENT" ]; then
    echo "Restarting Grafana deployment: $GRAFANA_DEPLOYMENT"
    oc rollout restart deployment/"$GRAFANA_DEPLOYMENT" -n "$NAMESPACE"
    echo "Waiting for Grafana to be ready..."
    oc rollout status deployment/"$GRAFANA_DEPLOYMENT" -n "$NAMESPACE" --timeout=180s
    echo "✓ Grafana restarted successfully"
else
    echo "WARNING: Grafana deployment not found in namespace $NAMESPACE"
    echo "Dashboards will be loaded when Grafana is deployed"
fi

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Dashboards deployed:"
echo "  - Common Notify - DEV Environment"
echo "  - Common Notify - TEST Environment"
echo "  - Common Notify - PROD Environment"
echo ""
echo "Alert rules deployed:"
echo "  - common-notify-errors (6 rules)"
echo "  - common-notify-performance (2 rules)"
echo "  - common-notify-security (2 rules)"
echo "  - loki-operational (2 rules)"
echo ""
echo "Next steps:"
echo "  1. Access Grafana to verify dashboards are loaded"
echo "  2. Configure Loki to mount and use alert rules ConfigMap"
echo "  3. Configure Alertmanager for alert routing (if not already done)"
echo ""
