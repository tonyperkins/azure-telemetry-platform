#!/usr/bin/env python3
"""
Script to retrieve unique visitor IP addresses from Azure Application Insights.

This script queries Azure Application Insights to get unique client IP addresses
from request telemetry data. It automatically discovers your workspace ID from Azure.

Requirements:
    pip install azure-identity azure-monitor-query

Authentication:
    Make sure you're logged in with Azure CLI: az login
"""

import os
import sys
import subprocess
import json
from datetime import datetime, timedelta
from azure.identity import DefaultAzureCredential, AzureCliCredential
from azure.monitor.query import LogsQueryClient, LogsQueryStatus
from azure.core.exceptions import HttpResponseError

def get_workspace_id_from_azure():
    """
    Automatically discover the Log Analytics Workspace ID from Azure.
    
    Returns:
        Workspace ID string or None if not found
    """
    try:
        result = subprocess.run(
            ['az', 'monitor', 'log-analytics', 'workspace', 'list', 
             '--query', '[0].customerId', '-o', 'tsv'],
            capture_output=True,
            text=True,
            check=True
        )
        workspace_id = result.stdout.strip()
        if workspace_id:
            return workspace_id
        return None
    except subprocess.CalledProcessError as e:
        print(f"Error running Azure CLI: {e}", file=sys.stderr)
        return None
    except FileNotFoundError:
        print("Azure CLI not found. Please install it: https://docs.microsoft.com/cli/azure/install-azure-cli", file=sys.stderr)
        return None

def get_workspace_name_from_azure():
    """Get the workspace name for display purposes."""
    try:
        result = subprocess.run(
            ['az', 'monitor', 'log-analytics', 'workspace', 'list',
             '--query', '[0].name', '-o', 'tsv'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except:
        return None

def get_app_insights_app_id():
    """Get the Application Insights App ID."""
    try:
        result = subprocess.run(
            ['az', 'monitor', 'app-insights', 'component', 'show',
             '--query', '[0].appId', '-o', 'tsv'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except:
        return None

def get_app_insights_name():
    """Get the Application Insights name."""
    try:
        result = subprocess.run(
            ['az', 'monitor', 'app-insights', 'component', 'show',
             '--query', '[0].name', '-o', 'tsv'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except:
        return None

def get_unique_visitor_ips(app_id, days_back=30, credential=None):
    """
    Query Application Insights for unique visitor IP addresses.
    
    Args:
        app_id: Application Insights Application ID or Workspace ID
        days_back: Number of days to look back (default: 30)
        credential: Azure credential object (optional)
    
    Returns:
        List of unique IP addresses
    """
    if credential is None:
        try:
            credential = DefaultAzureCredential()
        except Exception:
            credential = AzureCliCredential()
    
    client = LogsQueryClient(credential)
    
    # Calculate time range
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=days_back)
    
    # Kusto query to get unique client IPs from AppRequests (Application Insights table)
    query = """
    AppRequests
    | where TimeGenerated >= ago({days}d)
    | where isnotempty(ClientIP) and ClientIP != "0.0.0.0"
    | where Name !contains "Timer" and Name !contains "Ingestion"
    | summarize RequestCount = count() by ClientIP
    | order by RequestCount desc
    | project ClientIP, RequestCount
    """.format(days=days_back)
    
    try:
        response = client.query_workspace(
            workspace_id=app_id,
            query=query,
            timespan=timedelta(days=days_back)
        )
        
        if response.status == LogsQueryStatus.SUCCESS:
            unique_ips = []
            if response.tables:
                for table in response.tables:
                    for row in table.rows:
                        ip = row[0]  # clientIP
                        count = row[1]  # RequestCount
                        unique_ips.append({'ip': ip, 'request_count': count})
            return unique_ips
        else:
            print(f"Query failed with status: {response.status}", file=sys.stderr)
            if hasattr(response, 'partial_error'):
                print(f"Partial error: {response.partial_error}", file=sys.stderr)
            return []
            
    except HttpResponseError as e:
        print(f"HTTP Error: {e}", file=sys.stderr)
        print(f"Error details: {e.message}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"Error querying Application Insights: {e}", file=sys.stderr)
        return []

def main():
    """Main function to retrieve and display unique visitor IPs."""
    
    # Get days back from command line argument or use default
    days_back = 30
    if len(sys.argv) > 1:
        try:
            days_back = int(sys.argv[1])
        except ValueError:
            print(f"Invalid days_back value: {sys.argv[1]}", file=sys.stderr)
            sys.exit(1)
    
    print("Discovering Azure resources...")
    
    # Get both workspace ID and App Insights App ID
    workspace_id = get_workspace_id_from_azure()
    workspace_name = get_workspace_name_from_azure()
    app_id = get_app_insights_app_id()
    app_name = get_app_insights_name()
    
    if not workspace_id:
        print("\nError: Could not discover Log Analytics Workspace.", file=sys.stderr)
        print("Make sure you're authenticated with Azure CLI:", file=sys.stderr)
        print("  az login", file=sys.stderr)
        sys.exit(1)
    
    print(f"Found Log Analytics Workspace: {workspace_name or 'Unknown'}")
    print(f"Workspace ID: {workspace_id}")
    if app_name:
        print(f"Found Application Insights: {app_name}")
        print(f"App ID: {app_id}")
    print(f"\nQuerying Application Insights for unique visitor IPs (last {days_back} days)...")
    print()
    
    # Query for unique IPs
    unique_ips = get_unique_visitor_ips(workspace_id, days_back)
    
    if not unique_ips:
        print("No visitor IPs found or query failed.")
        sys.exit(1)
    
    # Display results
    print(f"Found {len(unique_ips)} unique visitor IP addresses:\n")
    print(f"{'IP Address':<20} {'Request Count':<15}")
    print("-" * 35)
    
    for item in unique_ips:
        print(f"{item['ip']:<20} {item['request_count']:<15}")
    
    # Also save to file
    output_file = f"visitor_ips_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(output_file, 'w') as f:
        f.write(f"Unique Visitor IPs (last {days_back} days)\n")
        f.write(f"Generated: {datetime.now().isoformat()}\n")
        f.write(f"Total unique IPs: {len(unique_ips)}\n\n")
        f.write(f"{'IP Address':<20} {'Request Count':<15}\n")
        f.write("-" * 35 + "\n")
        for item in unique_ips:
            f.write(f"{item['ip']:<20} {item['request_count']:<15}\n")
    
    print(f"\nResults saved to: {output_file}")

if __name__ == "__main__":
    main()
