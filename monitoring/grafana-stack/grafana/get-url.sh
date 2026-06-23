#!/bin/bash

echo "========================================"
echo "Grafana Access Information"
echo "========================================"
echo ""

# Check if Grafana is deployed
if ! oc get deployment grafana -n f6bc3f-tools &> /dev/null; then
    echo "Error: Grafana is not deployed in f6bc3f-tools namespace"
    exit 1
fi

# Check if Route exists
if ! oc get route grafana -n f6bc3f-tools &> /dev/null; then
    echo "Warning: Grafana Route does not exist. Creating it..."
    oc apply -f route.yaml
    echo ""
fi

# Get the Route URL
ROUTE_URL=$(oc get route grafana -n f6bc3f-tools -o jsonpath='{.spec.host}' 2>/dev/null)

if [ -z "$ROUTE_URL" ]; then
    echo "Error: Could not retrieve Grafana Route URL"
    exit 1
fi

echo "Grafana URL: https://$ROUTE_URL"
echo ""
echo "Username: admin"
echo ""
echo "Password:"
PASSWORD=$(oc get secret grafana-admin-credentials -n f6bc3f-tools -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d)
if [ -z "$PASSWORD" ]; then
    echo "  Error: Could not retrieve password"
else
    echo "  $PASSWORD"
fi
echo ""

# Check Route status
echo "Route Status:"
oc get route grafana -n f6bc3f-tools
echo ""

# Check if Grafana pod is running
echo "Grafana Pod Status:"
oc get pods -n f6bc3f-tools -l app.kubernetes.io/name=grafana
echo ""

echo "To manually retrieve password later:"
echo "  oc get secret grafana-admin-credentials -n f6bc3f-tools -o jsonpath='{.data.admin-password}' | base64 -d ; echo"
echo ""
