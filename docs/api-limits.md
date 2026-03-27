# API Rate Limits & Capacity Planning

## OpenSky Network (Flight Data)

### Free Tier Limits
- **Anonymous**: 400 credits/day
- **Registered Account**: 4,000 credits/day (recommended)
- **Reset**: Daily at 00:00 UTC

### Current Usage
- **Polling Interval**: 30 seconds
- **Daily Requests**: 2,880 (24 hours × 120 requests/hour)
- **Headroom**: 1,120 credits/day (28% buffer)

### Rate Limit Details
Each API call consumes credits based on:
- 1 credit per request for bounding box queries (what we use)
- Larger queries (e.g., all aircraft globally) consume more credits

### Upgrade Options
**OpenSky does NOT offer paid tiers.** It's a non-profit research network funded by academic institutions. The 4,000 credits/day limit is the maximum available to any user.

**Alternatives if you need higher frequency:**
1. **Reduce polling interval strategically**:
   - Poll every 45s instead of 30s → 1,920 requests/day (52% headroom)
   - Poll every 60s → 1,440 requests/day (64% headroom)

2. **Use commercial flight tracking APIs**:
   - **FlightAware AeroAPI**: $0.0025–$0.01/request, no daily limit
   - **AviationStack**: 500 free requests/month, paid plans start at $9.99/month
   - **FlightRadar24 Data API**: Custom enterprise pricing

3. **Self-host ADS-B receiver**:
   - Hardware: ~$150 (Raspberry Pi + RTL-SDR dongle + antenna)
   - Range: 200–300 miles (covers all of Texas)
   - No API limits, real-time data

### Monitoring
Current usage is logged in Application Insights:
```kusto
traces
| where message contains "OpenSky"
| summarize count() by bin(timestamp, 1h)
```

---

## Capital Metro GTFS (Bus Data)

### Static Feed (Route Shapes, Stops)
- **URL**: https://www.capmetro.org/planner/includes/gtfs.zip
- **Size**: ~2–5 MB
- **Rate Limit**: None (static file download)
- **Cache**: 24 hours in-memory (IMemoryCache)
- **Daily Requests**: ~1 per API restart

### Real-Time Feed (Vehicle Positions)
- **URL**: https://data.texas.gov/resource/eiei-9rpf.json (GTFS-RT protobuf)
- **Rate Limit**: None (public open data portal)
- **Polling Interval**: 30 seconds
- **Daily Requests**: 2,880

### Upgrade Options
Not applicable — Capital Metro's feed is free and unlimited.

---

## Azure SQL Serverless

### Current Tier
- **Compute**: 0.5–1 vCore (auto-scales)
- **Storage**: 5 GB max
- **Cost**: ~$5–15/month (pay-per-use)

### Rate Limits
- **Max DTU**: Scales automatically based on vCore tier
- **Max Connections**: 100 (serverless tier)
- **Query Timeout**: 30 seconds (configured in SqlBulkCopy)

### Current Usage
- **Ingestion**: 2 bulk inserts/minute (metro + flight)
- **API Queries**: ~10–50/minute (dashboard polling)
- **Storage**: ~500 MB/month (6-hour retention window)

### Upgrade Path
If you hit DTU limits (queries start timing out):
1. **Increase vCore**: 0.5 → 1 → 2 vCores (~$10–30/month)
2. **Switch to Provisioned**: Fixed compute, no auto-pause (~$50–200/month)
3. **Add Read Replicas**: Offload dashboard queries to a read-only replica

---

## TelemetryApi (Your .NET API)

### Current Tier
- **App Service Plan**: B1 Basic (~$13/month)
- **Compute**: 1 vCPU, 1.75 GB RAM
- **Bandwidth**: 165 GB/month included

### Rate Limits
**None imposed by you.** You control the App Service and can scale as needed.

### Monitoring
- **Current RPS**: ~0.5 requests/second (dashboard polling)
- **Peak Capacity**: ~100 RPS on B1 tier (Dapper is very efficient)

### Upgrade Path
1. **B2 Basic**: 2 vCPU, 3.5 GB RAM (~$26/month)
2. **S1 Standard**: 1 vCPU, 1.75 GB RAM + auto-scale (~$70/month)
3. **P1v2 Premium**: 1 vCPU, 3.5 GB RAM + VNet integration (~$150/month)

---

## Dashboard (Static Web App)

### Current Tier
- **Free Tier**: 100 GB bandwidth/month, unlimited requests
- **CDN**: Global edge caching (Azure Front Door)

### Rate Limits
None. Static Web Apps are designed for high traffic.

### Upgrade Path
- **Standard Tier** ($9/month): Custom domains, SLA, 400 GB bandwidth

---

## Summary: What You're Paying For

| Service | Current Cost | Rate Limit | Upgrade Options |
|---------|-------------|------------|-----------------|
| **OpenSky Network** | Free | 4,000 credits/day | None (non-profit) |
| **Capital Metro GTFS** | Free | None | N/A |
| **Azure SQL Serverless** | ~$10/month | Auto-scales | Increase vCores |
| **App Service (API)** | ~$13/month | None | Scale up/out |
| **Static Web App** | Free | None | Standard tier |
| **Application Insights** | ~$2/month | 5 GB free/month | Pay-per-GB |
| **Total** | **~$25/month** | - | - |

---

## Recommendations

1. **Keep OpenSky at 30s polling** — you have 28% headroom, which is healthy.
2. **Monitor SQL DTU usage** — if queries start timing out, bump to 1 vCore.
3. **Consider ADS-B receiver** — if you want sub-second flight updates or need to track aircraft beyond OpenSky's coverage.
4. **Set up budget alerts** — Azure Cost Management can email you if spending exceeds $50/month.

---

## Contact for Upgrades

- **OpenSky**: No paid tier available. Email support@opensky-network.org for research partnerships.
- **Azure**: Upgrade via Azure Portal → Resource → Scale Up/Out.
- **Capital Metro**: Contact CapMetro IT if the GTFS feed URL changes.
