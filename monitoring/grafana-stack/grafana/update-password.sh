#!/bin/bash
set -e

NAMESPACE="f6bc3f-dev"
SECRET_NAME="grafana-admin-credentials"

echo "🔐 Update Grafana Admin Password"
echo "=================================="
echo ""

# Check if secret exists
if ! kubectl get secret ${SECRET_NAME} -n ${NAMESPACE} &>/dev/null; then
  echo "❌ Secret ${SECRET_NAME} not found in namespace ${NAMESPACE}"
  echo ""
  echo "Create it first:"
  echo "  kubectl apply -f secret.yaml"
  exit 1
fi

echo "Current admin user:"
CURRENT_USER=$(kubectl get secret ${SECRET_NAME} -n ${NAMESPACE} -o jsonpath='{.data.admin-user}' | base64 --decode)
echo "  ${CURRENT_USER}"
echo ""

# Option 1: Generate random password
echo "Choose password option:"
echo "  1) Generate a random secure password (recommended)"
echo "  2) Enter a custom password"
echo ""
read -p "Enter choice [1-2]: " CHOICE

if [ "$CHOICE" == "1" ]; then
  # Generate random password
  NEW_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
  echo ""
  echo "✅ Generated random password:"
  echo "   ${NEW_PASSWORD}"
  echo ""
  echo "⚠️  SAVE THIS PASSWORD - You won't be able to retrieve it later!"
  echo ""
  read -p "Press Enter to update the secret with this password..."
elif [ "$CHOICE" == "2" ]; then
  # Custom password
  echo ""
  read -sp "Enter new password: " NEW_PASSWORD
  echo ""
  read -sp "Confirm new password: " NEW_PASSWORD_CONFIRM
  echo ""

  if [ "$NEW_PASSWORD" != "$NEW_PASSWORD_CONFIRM" ]; then
    echo "❌ Passwords do not match!"
    exit 1
  fi

  if [ -z "$NEW_PASSWORD" ]; then
    echo "❌ Password cannot be empty!"
    exit 1
  fi
else
  echo "❌ Invalid choice!"
  exit 1
fi

# Update the secret
echo ""
echo "📝 Updating secret..."
kubectl patch secret ${SECRET_NAME} -n ${NAMESPACE} \
  --type='json' \
  -p="[{\"op\": \"replace\", \"path\": \"/data/admin-password\", \"value\": \"$(echo -n ${NEW_PASSWORD} | base64)\"}]"

echo "✅ Password updated successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  IMPORTANT: Restart Grafana for changes to take effect"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Restart Grafana pod:"
echo "  kubectl rollout restart deployment grafana -n ${NAMESPACE}"
echo ""
echo "Wait for it to be ready:"
echo "  kubectl rollout status deployment grafana -n ${NAMESPACE}"
echo ""
echo "Then login with:"
echo "  URL: https://grafana-f6bc3f-dev.apps.silver.devops.gov.bc.ca"
echo "  Username: ${CURRENT_USER}"
echo "  Password: (the new password you just set)"
echo ""
