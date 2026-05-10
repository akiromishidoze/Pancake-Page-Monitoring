# Pancake Monitor Dashboard

Read-only Next.js dashboard that visualizes the n8n monitoring workflow's current state.

## Quick start

```bash
# Install deps (one time only)
npm install

# Env values are already in .env.local on this machine.
# If you copy this project to another machine, run:
#   cp .env.local.example .env.local
# and fill in the secret.

# Run dev server
npm run dev
```

Open http://localhost:3001 (port set in `.env.local`).

## Architecture

```
Next.js 16 (app router, src dir, TypeScript, Tailwind)
  ├─ src/lib/receiver.ts       — typed fetch wrapper for /pancake-monitoring-status
  ├─ src/components/StatusCard.tsx
  └─ src/app/
       ├─ layout.tsx            — header, nav, global styles
       └─ page.tsx              — Overview (4 status cards + 2 detail panels)
```

The dashboard is a single Server Component that fetches the receiver's status
endpoint on render. No database in v1 — read-only mirror of current state.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `RECEIVER_URL` | Full URL to the n8n receiver's `/pancake-monitoring-status` endpoint |
| `MONITOR_SECRET` | Shared secret for `X-Monitor-Secret` header (same as N2 secret in main workflow) |
| `PORT` | Local port, default 3001 (avoids conflict with other local apps on 3000) |

## What's shown

Overview page:
- **Heartbeat** — fresh / stale, age in minutes
- **Run Quality** — full / partial / degraded
- **Canary** — ok / down (alert if down)
- **Alerts** — alert_count from latest run
- **Receiver state** — runs received, sd size, last backup status
- **Run details** — run ID, rule version, maintenance, e2e mismatches, fetch errors

## Future phases (not yet implemented)

- Phase 2: SQLite + polling worker for historical accumulation
- Phase 3: Page detail / Run history / System health screens
- Phase 4: Auth, always-on hosting (systemd / pm2)

See `../WEB_APP_PROPOSAL.md` and `../BACKLOG.md` for the full plan.

## Caveat

The receiver endpoint only exposes summary metadata (latest_health, heartbeat,
backup state). It does NOT yet expose per-page detail. Page list, page detail,
and run history screens require either:

1. Extending the receiver to retain richer state, OR
2. Adding a polling worker (Phase 2) that accumulates per-run snapshots into
   local SQLite

Pick (2) when you want history.
