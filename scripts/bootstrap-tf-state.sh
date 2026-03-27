#!/usr/bin/env bash
# =============================================================================
# scripts/bootstrap-tf-state.sh
#
# One-time setup: creates the Azure storage account that holds Terraform remote
# state. This MUST be run before `terraform init` on a fresh environment.
#
# Run once per environment. Idempotent — safe to re-run.
#
# Usage:
#   chmod +x scripts/bootstrap-tf-state.sh
#   ./scripts/bootstrap-tf-state.sh
#
# Prerequisites:
#   az login (or ARM_* environment variables set for service principal auth)
# =============================================================================

set -euo pipefail

SUBSCRIPTION_ID="780f4576-d4f2-4959-a6a9-0c61fd12b7ca"
LOCATION="southcentralus"
RG_NAME="rg-terraform-state"
STORAGE_ACCOUNT="stterrastateatp1"
CONTAINER_NAME="tfstate"

echo "=== Bootstrapping Terraform remote state ==="
echo "Subscription : $SUBSCRIPTION_ID"
echo "Location     : $LOCATION"
echo "Storage Acct : $STORAGE_ACCOUNT"
echo ""

# Ensure we're using the correct subscription
az account set --subscription "$SUBSCRIPTION_ID"

# Resource group
echo "[1/4] Creating resource group: $RG_NAME"
az group create \
  --name "$RG_NAME" \
  --location "$LOCATION" \
  --output none

# Storage account
echo "[2/4] Creating storage account: $STORAGE_ACCOUNT"
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RG_NAME" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access false \
  --min-tls-version TLS1_2 \
  --output none

# Blob container
echo "[3/4] Creating container: $CONTAINER_NAME"
az storage container create \
  --name "$CONTAINER_NAME" \
  --account-name "$STORAGE_ACCOUNT" \
  --auth-mode login \
  --output none

# Enable versioning for state recovery
echo "[4/4] Enabling blob versioning (state file recovery)"
az storage account blob-service-properties update \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RG_NAME" \
  --enable-versioning true \
  --output none

echo ""
echo "=== Bootstrap complete ==="
echo ""
echo "Next steps:"
echo "  1. cd infra"
echo "  2. terraform init"
echo "  3. terraform plan -var='sql_admin_password=<PASSWORD>' -var='alert_email=<EMAIL>'"
echo "  4. terraform apply"
echo ""
echo "Terraform backend config (already in infra/main.tf):"
echo "  resource_group_name  = \"$RG_NAME\""
echo "  storage_account_name = \"$STORAGE_ACCOUNT\""
echo "  container_name       = \"$CONTAINER_NAME\""
echo "  key                  = \"azure-telemetry-platform.tfstate\""
