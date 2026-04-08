#!/usr/bin/env python3
"""Quick script to check the schema of AppRequests table."""

import subprocess
import sys
from datetime import timedelta
from azure.identity import DefaultAzureCredential, AzureCliCredential
from azure.monitor.query import LogsQueryClient

def get_workspace_id():
    result = subprocess.run(
        ['az', 'monitor', 'log-analytics', 'workspace', 'list', 
         '--query', '[0].customerId', '-o', 'tsv'],
        capture_output=True, text=True, check=True
    )
    return result.stdout.strip()

workspace_id = get_workspace_id()
print(f"Workspace ID: {workspace_id}\n")

try:
    credential = DefaultAzureCredential()
except:
    credential = AzureCliCredential()

client = LogsQueryClient(credential)

# Check if real IPs are in Properties
query = """
AppRequests
| where TimeGenerated >= ago(7d)
| where Name contains "/api/"
| take 5
| extend props = parse_json(Properties)
| project TimeGenerated, Name, ClientIP, Properties
"""

try:
    response = client.query_workspace(
        workspace_id=workspace_id,
        query=query,
        timespan=timedelta(days=30)
    )
    
    if response.tables:
        for table in response.tables:
            print("Columns:", table.columns)
            print("\nRows:")
            for row in table.rows:
                print(f"\nTime: {row[0]}")
                print(f"Name: {row[1]}")
                print(f"ClientIP: {row[2]}")
                print(f"Properties: {row[3]}")
except Exception as e:
    print(f"Error: {e}")
