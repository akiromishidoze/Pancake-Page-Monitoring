# Backfill Mechanism

The dashboard uses a background poller (`src/lib/poller.ts`) to collect monitoring
snapshots every 60s. If the poller starts on a fresh SQLite database (no historical
data), the optional backfill feature can import past snapshots.

## How it works

The `POST /api/backfill` endpoint tries these sources (in order):

1. **`RECEIVER_HISTORY_URL`** — explicit history endpoint on the n8n receiver
2. **`N8N_API_URL` + `N8N_API_KEY` + `MONITOR_WORKFLOW_ID`** — replays past
   execution metadata from the n8n executions API (lightweight; creates timeline
   entries without page-level data; page data accumulates forward via poller)
3. **`RECEIVER_URL`** — single snapshot fallback (latest run only)

The UI shows a **Backfill History** button on the Overview page when the database
has fewer than 5 runs.

## N8n Executions Backfill (default path)

When `N8N_API_URL` and `N8N_API_KEY` are set (current setup), the backfill fetches
the list of successful executions for the monitoring workflow via the n8n REST API
and creates historical run entries from execution metadata (status, startedAt).

**Limitations:**
- The n8n execution data with `includeData=true` is ~7.5 MB per execution — too
  heavy to batch-fetch. Page-level data (page_states) is only available for runs
  captured by the live poller going forward.
- For full page-level history from past runs, add a history endpoint to the receiver
  workflow (see `## Receiver History Endpoint Contract` below).

## Receiver History Endpoint Contract

Configured via `RECEIVER_HISTORY_URL` in `.env.local`.

### Request

```
GET <RECEIVER_HISTORY_URL>
Headers:
  X-Monitor-Secret: <MONITOR_SECRET>
```

Optional query params:
- `limit` — max snapshots to return (default 1000, max 5000)
- `after` — ISO timestamp, return only snapshots newer than this
- `before` — ISO timestamp or run_id, return only snapshots older than this

### Response (200 OK)

```json
{
  "ok": true,
  "snapshots": [
    {
      "generated_at": "2026-05-12T10:00:00.000Z",
      "run_id": "run_abc123",
      "status": "fresh",
      "latest_health": {
        "run_id": "run_abc123",
        "run_quality": "full",
        "severity": "info",
        "canary_status": "ok",
        "canary_alert": false,
        "outage_suspected": false,
        "alert_count": 0,
        "rule_version": 3,
        "in_maintenance_window": false,
        "e2e_pancake_active_botcake_inactive": 0,
        "fetch_errors_orders": 0,
        "fetch_errors_customers": 0
      },
      "totals": {
        "total": 50,
        "active": 42,
        "inactive": 8
      },
      "active_pages": [
        {
          "shop_label": "Shop 1",
          "name": "Page Name",
          "page_id": "fb_12345",
          "activity_kind": "funnel_converting",
          "activation_reason": "new_order",
          "state_change": null,
          "is_canary": false,
          "response_ms": 234,
          "fetch_errors": 0,
          "last_order_at": "2026-05-12T09:55:00.000Z"
        }
      ],
      "inactive_pages": [],
      "receiver_sd_size_bytes": 1048576
    }
  ],
  "total_available": 500,
  "returned_count": 100
}
```

### Alternative Response (bare array)

The endpoint may also return a bare JSON array of snapshot objects
(instead of the `{ ok, snapshots }` wrapper).

### Fallback: Single Snapshot

If `RECEIVER_HISTORY_URL` is not set, the backfill route falls back to
`RECEIVER_URL` and treats its response as a single snapshot. This will
only insert the latest run — no historical depth.

## Triggering a Backfill

### From the dashboard UI

Once the receiver is reachable and the DB has < 5 runs, a **"Backfill History"**
button appears in the Receiver info panel on the Overview page.

### Via API

```bash
curl -X POST http://localhost:3001/api/backfill \
  -H "Content-Type: application/json"
```

### Check status

```bash
curl http://localhost:3001/api/backfill
# → { "ok": true, "db_run_count": 120, "last_backfill_at": "2026-05-12T10:00:00.000Z", ... }
```
