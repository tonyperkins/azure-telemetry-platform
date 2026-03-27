# Postmortem Template

> Copy this file to `docs/postmortems/YYYY-MM-DD-<short-title>.md` and fill it in.
> Postmortems are blameless. The goal is to improve the system, not to assign fault.

---

## Incident Summary

| Field | Value |
|---|---|
| **Date** | YYYY-MM-DD |
| **Duration** | HH:MM — HH:MM UTC (X minutes) |
| **Severity** | P1 / P2 / P3 |
| **Components affected** | e.g. MetroIngestion, TelemetryApi |
| **User impact** | e.g. Dashboard showed stale vehicle positions for 18 minutes |
| **Detected by** | Alert / Customer report / Monitoring |
| **Resolved by** | e.g. Restarted Function App |
| **Author** | |
| **Reviewers** | |

---

## Timeline

> All times UTC. Use past tense. One event per row.

| Time | Event |
|---|---|
| HH:MM | Alert fired: `alert-metro-feed-stale-prod` |
| HH:MM | On-call engineer acknowledged alert |
| HH:MM | Identified root cause: ... |
| HH:MM | Mitigation applied: ... |
| HH:MM | Service restored; alert cleared |
| HH:MM | Monitoring confirmed normal ingestion rate |

---

## Root Cause

> Describe the root cause in one or two paragraphs. Be specific — "a bug" is not a root cause. "A null reference exception on line 42 of GtfsRtFeedService.cs when the feed returns an empty entity list" is a root cause.

---

## Contributing Factors

> What conditions had to be true simultaneously for this incident to occur? List each independently.

- [ ] Factor 1
- [ ] Factor 2

---

## Impact

**Quantified impact:**
- X vehicles missed from ingestion over Y minutes
- Z users observed stale data on the dashboard
- API error rate: X% (normal: <1%)

**Business impact:**
- describe any downstream effects

---

## What Went Well

> Be specific. Generic praise is not useful.

- The staleness alert fired within 3 minutes of the feed becoming empty.
- Runbook step 3.1 correctly identified the upstream feed as the cause.
- ...

---

## What Went Poorly

- ...

---

## Action Items

> Each action item must have a single owner and a due date. Unowned items do not get done.

| # | Action | Owner | Due | Status |
|---|---|---|---|---|
| 1 | Add retry with exponential backoff to GtfsRtFeedService | | | Open |
| 2 | Add alert for consecutive Function App restarts | | | Open |
| 3 | Document OpenSky rate limit in runbook | | | Open |

---

## Lessons Learned

> What would you tell your future self to prevent this class of incident?

---

## References

- Alert link: https://portal.azure.com/#...
- App Insights query: (paste KQL)
- GitHub issue: #
