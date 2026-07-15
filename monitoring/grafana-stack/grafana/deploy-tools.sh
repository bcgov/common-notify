#!/bin/bash
set -e

echo "========================================"
echo "Deploying Grafana to f6bc3f-tools"
echo "========================================"

# Add Grafana Helm repo
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Create Grafana admin secret if it doesn't exist
if ! oc get secret grafana-admin-credentials -n f6bc3f-tools &> /dev/null; then
    echo "Creating Grafana admin credentials secret..."
    ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    oc create secret generic grafana-admin-credentials \
      --from-literal=admin-user=admin \
      --from-literal=admin-password="$ADMIN_PASSWORD" \
      -n f6bc3f-tools
    echo "✓ Admin credentials created"
    echo "  Username: admin"
    echo "  Password: $ADMIN_PASSWORD"
    echo "  (Save this password!)"
    echo ""
else
    echo "Grafana admin credentials already exist"
    echo ""
fi

# Deploy Grafana
helm upgrade --install grafana grafana/grafana \
  --namespace f6bc3f-tools \
  --values values-tools.yaml \
  --wait \
  --timeout 5m

echo ""
echo "Creating OpenShift Route..."
oc apply -f route.yaml

echo ""
echo "✓ Grafana deployed successfully to f6bc3f-tools!"
echo ""
echo "Access Grafana:"
echo "  URL: https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca"
echo "  Username: admin"
echo "  Password: (retrieve with command below)"
echo ""
echo "Get password:"
echo "  oc get secret grafana-admin-credentials -n f6bc3f-tools -o jsonpath='{.data.admin-password}' | base64 -d ; echo"
echo ""
echo "Verify:"
echo "  oc get pods -n f6bc3f-tools -l app.kubernetes.io/name=grafana"
echo ""
