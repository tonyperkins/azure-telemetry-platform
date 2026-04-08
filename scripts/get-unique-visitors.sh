#!/bin/bash
# Azure Telemetry Platform - Pull unique visitor IPs from Azure
# Usage: ./scripts/get-unique-visitors.sh [days]
#
# Requires: Azure CLI (az), unzip
# Downloads logs from Azure App Service and extracts unique visitor IPs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."

DAYS="${1:-7}"

SUBSCRIPTION_ID="780f4576-d4f2-4959-a6a9-0c61fd12b7ca"
RESOURCE_GROUP="rg-telemetry-atp-prod"
APP_SERVICE="app-telemetry-prod-7d94f06a"

INTERNAL_IP_PREFIXES=(
    "10."
    "127."
    "169.254."
    "172.16." "172.17." "172.18." "172.19." "172.20." "172.21." "172.22." "172.23." "172.24." "172.25." "172.26." "172.27." "172.28." "172.29." "172.30." "172.31."
    "192.168."
)

echo "Azure App Service - Unique Visitor IP Extractor"
echo "================================================"
echo ""
echo "Time range: last ${DAYS} days"
echo ""

# Check if HTTP logging is enabled
HTTP_LOGGING=$(az webapp log show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_SERVICE" \
    --query "httpLogs.fileSystem.enabled" -o tsv 2>/dev/null)

if [ "$HTTP_LOGGING" != "true" ]; then
    echo "HTTP logging is disabled. Enabling now..."
    az webapp log config \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_SERVICE" \
        --application-logging filesystem \
        --level verbose \
        --web-server-logging filesystem 2>/dev/null
    echo "HTTP logging enabled."
    echo ""
fi

# Create temp directory
TEMP_DIR=$(mktemp -d)
LOG_ZIP="$TEMP_DIR/logs.zip"

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Download logs
echo "Downloading logs from $APP_SERVICE..."
if ! az webapp log download \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_SERVICE" \
    --log-file "$LOG_ZIP" 2>&1; then
    echo "WARNING: Log download failed or returned no data."
    exit 0
fi

if [ ! -f "$LOG_ZIP" ] || [ ! -s "$LOG_ZIP" ]; then
    echo "No log data available."
    exit 0
fi

# Extract HTTP logs
echo "Extracting and analyzing HTTP logs..."
HTTP_LOG_CONTENT=$(unzip -p "$LOG_ZIP" "LogFiles/http/RawLogs/*.log" 2>/dev/null)

if [ -z "$HTTP_LOG_CONTENT" ]; then
    echo "No HTTP log files found in archive."
    exit 0
fi

declare -A UNIQUE_IPS

# Parse IIS log format
# Fields: date time s-sitename cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) ...
# Column 9 (1-indexed) is c-ip (client IP)
while IFS= read -r line; do
    # Skip comment lines and empty lines
    [[ "$line" =~ ^#.* ]] && continue
    [[ -z "$line" ]] && continue
    
    # Split by whitespace and get the c-ip field (9th field)
    set -- $line
    c_ip="$9"
    
    # Validate IP format
    if [[ "$c_ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        UNIQUE_IPS["$c_ip"]=1
    fi
done <<< "$HTTP_LOG_CONTENT"

echo ""
echo "=== Unique External Visitor IPs ==="
echo ""

EXTERNAL_IPS=()
for ip in "${!UNIQUE_IPS[@]}"; do
    IS_INTERNAL=0
    for prefix in "${INTERNAL_IP_PREFIXES[@]}"; do
        if [[ "$ip" == "$prefix"* ]]; then
            IS_INTERNAL=1
            break
        fi
    done

    if [ $IS_INTERNAL -eq 0 ]; then
        EXTERNAL_IPS+=("$ip")
    fi
done

printf '%s\n' "${EXTERNAL_IPS[@]}" | sort -V

echo ""
echo "=== Internal IPs (Azure infrastructure - filtered) ==="
echo ""

for ip in "${!UNIQUE_IPS[@]}"; do
    IS_INTERNAL=0
    for prefix in "${INTERNAL_IP_PREFIXES[@]}"; do
        if [[ "$ip" == "$prefix"* ]]; then
            IS_INTERNAL=1
            break
        fi
    done

    if [ $IS_INTERNAL -eq 1 ]; then
        echo "$ip"
    fi
done | sort -V

VISITOR_COUNT=${#EXTERNAL_IPS[@]}

echo ""
echo "Total unique external visitors: $VISITOR_COUNT"
echo "Total unique IPs (including internal): ${#UNIQUE_IPS[@]}"
