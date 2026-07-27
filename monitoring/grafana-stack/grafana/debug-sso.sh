#!/bin/bash
# Debug script to check Grafana SSO configuration

NAMESPACE="f6bc3f-tools"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Grafana SSO Debug Information"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "1️⃣ Checking if SSO secret exists..."
if oc get secret grafana-sso-credentials -n ${NAMESPACE} &> /dev/null; then
    echo "✅ Secret grafana-sso-credentials exists"
    echo "   Keys: $(oc get secret grafana-sso-credentials -n ${NAMESPACE} -o jsonpath='{.data}' | jq -r 'keys[]' 2>/dev/null || echo 'client_id, client_secret')"
else
    echo "❌ Secret grafana-sso-credentials NOT FOUND"
    echo "   This secret is required for SSO to work!"
fi
echo ""

echo "2️⃣ Checking Grafana pod status..."
POD_NAME=$(oc get pods -n ${NAMESPACE} -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$POD_NAME" ]; then
    echo "✅ Grafana pod: ${POD_NAME}"
    POD_STATUS=$(oc get pod ${POD_NAME} -n ${NAMESPACE} -o jsonpath='{.status.phase}')
    echo "   Status: ${POD_STATUS}"

    # Check pod age
    POD_AGE=$(oc get pod ${POD_NAME} -n ${NAMESPACE} -o jsonpath='{.metadata.creationTimestamp}')
    echo "   Created: ${POD_AGE}"
else
    echo "❌ No Grafana pod found"
fi
echo ""

echo "3️⃣ Checking if SSO secret is mounted..."
if [ -n "$POD_NAME" ]; then
    MOUNT_CHECK=$(oc get pod ${POD_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.volumes[?(@.name=="auth-generic-oauth-secret-mount")].secret.secretName}' 2>/dev/null)
    if [ -n "$MOUNT_CHECK" ]; then
        echo "✅ SSO secret is mounted: ${MOUNT_CHECK}"
    else
        echo "❌ SSO secret NOT mounted in pod"
        echo "   Pod needs to be recreated with SSO configuration"
    fi
fi
echo ""

echo "4️⃣ Checking Grafana Helm values..."
HELM_VALUES=$(helm get values grafana -n ${NAMESPACE} 2>/dev/null)
if echo "$HELM_VALUES" | grep -q "auth.generic_oauth"; then
    echo "✅ OAuth configuration found in Helm values"
    echo "$HELM_VALUES" | grep -A 5 "auth.generic_oauth"
else
    echo "❌ OAuth configuration NOT found in Helm values"
    echo "   Grafana was deployed without SSO config"
fi
echo ""

echo "5️⃣ Checking Grafana logs for OAuth errors..."
if [ -n "$POD_NAME" ]; then
    echo "Recent logs (last 20 lines):"
    oc logs ${POD_NAME} -n ${NAMESPACE} --tail=20 | grep -i -E "(oauth|sso|auth|error)" || echo "   No OAuth-related messages found"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Recommended Actions:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ! oc get secret grafana-sso-credentials -n ${NAMESPACE} &> /dev/null; then
    echo "❌ Create SSO secret first:"
    echo "   Run the GitHub Actions workflow to deploy Grafana"
fi

if [ -n "$HELM_VALUES" ] && ! echo "$HELM_VALUES" | grep -q "auth.generic_oauth"; then
    echo "❌ Redeploy Grafana with SSO values:"
    echo "   helm upgrade grafana grafana/grafana \\"
    echo "     -n ${NAMESPACE} \\"
    echo "     -f monitoring/grafana-stack/grafana/values-tools-sso.yaml"
fi

if [ -n "$POD_NAME" ] && [ -z "$MOUNT_CHECK" ]; then
    echo "❌ Restart Grafana pod to mount SSO secret:"
    echo "   oc delete pod ${POD_NAME} -n ${NAMESPACE}"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
