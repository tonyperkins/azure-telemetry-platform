#!/bin/bash
set -e

# SRE: Local Infrastructure Validation
# Running this script before pushing to 'main' ensures that the 
# GitHub Actions pipeline will not fail on formatting or syntax errors.

# Find the script's directory and move to the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "--- 🛠️  Validating Infrastructure ---"

if [ ! -d "infra" ]; then
    echo "::error::Directory 'infra' not found. Please run from the project root."
    exit 1
fi

cd infra

echo "1. Checking formatting (terraform fmt)..."
terraform fmt -check -recursive

echo "2. Initializing environment (no backend)..."
terraform init -backend=false -input=false

echo "3. Validating syntax (terraform validate)..."
terraform validate

echo ""
echo "--- ✅  All checks passed locally! Ready to push. ---"
echo ""
