#!/usr/bin/env bash
# =============================================================================
# scripts/create-service-principal.sh
#
# Creates an Azure service principal for GitHub Actions CI/CD.
# The output JSON is stored as the AZURE_CREDENTIALS GitHub secret.
#
# Run ONCE after bootstrap-tf-state.sh. The SP needs:
#   - Contributor on the main subscription (for terraform apply)
#   - Storage Blob Data Contributor on rg-terraform-state (for remote state)
#
# Usage:
#   chmod +x scripts/create-service-principal.sh
#   ./scripts/create-service-principal.sh
# =============================================================================

set -euo pipefail

SUBSCRIPTION_ID="780f4576-d4f2-4959-a6a9-0c61fd12b7ca"
SP_NAME="sp-telemetry-github-actions"
TF_STATE_RG="rg-terraform-state"
TF_STATE_SA="stterrastateatp1"

echo "=== Creating GitHub Actions service principal ==="
echo ""

az account set --subscription "$SUBSCRIPTION_ID"

# Create SP with Contributor role on the subscription
echo "[1/3] Creating service principal: $SP_NAME"
SP_JSON=$(az ad sp create-for-rbac \
  --name "$SP_NAME" \
  --role Contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID" \
  --sdk-auth \
  --output json)

# Extract the client ID for subsequent role assignment
CLIENT_ID=$(echo "$SP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['clientId'])")

echo "[2/3] Granting Storage Blob Data Contributor on Terraform state storage"
# The SP needs this to read/write Terraform state files
STORAGE_ID=$(az storage account show \
  --name "$TF_STATE_SA" \
  --resource-group "$TF_STATE_RG" \
  --query id --output tsv)

az role assignment create \
  --assignee "$CLIENT_ID" \
  --role "Storage Blob Data Contributor" \
  --scope "$STORAGE_ID" \
  --output none

echo "[3/3] Done"
echo ""
echo "==================================================================="
echo "AZURE_CREDENTIALS secret (paste this into GitHub → Settings → Secrets):"
echo "==================================================================="
echo ""
echo "$SP_JSON"
echo ""
echo "==================================================================="
echo ""
echo "Also set these GitHub secrets (collect values after terraform apply):"
echo "  TF_VAR_sql_admin_password  — strong password for Azure SQL admin"
echo "  TF_VAR_alert_email         — your on-call email for alerts"
echo "  APP_SERVICE_NAME           — from: terraform output -raw app_service_name"
echo "  FUNCTION_APP_NAME          — from: terraform output -raw function_app_name"
echo "  APP_SERVICE_HOSTNAME       — from: terraform output -raw app_service_hostname"
echo "  AZURE_STATIC_WEB_APPS_API_TOKEN — from: terraform output -raw static_web_api_key"
