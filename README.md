# Page Monitor Dashboard

Standalone SaaS dashboard for monitoring Facebook page activity across multiple platforms. Collects snapshot data via API ingestion and automated polling, with alerting, real-time updates, and data retention.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in secrets
npm run dev
```

Open http://localhost:3001 (default credentials: Email `admin`, Password `admin`).

## Features

- **Multi-platform monitoring** — BotCake API polling, generic REST connector polling, external ingest via `POST /api/ingest`
- **Overview dashboard** — heartbeat, run quality, canary status, alert count per platform
- **Page detail** — per-page metrics (uptime, SLA, MTTR/MTBF, response time, failures, incident timeline)
- **Run history** — browsable and filterable run log with pagination (`/runs`)
- **Real-time updates** — SSE (Server-Sent Events) pushes dashboard refreshes on new data
- **Alerting** — Slack webhook notifications for canary down, outage suspected, high alerts, degraded quality, stale heartbeat
- **Data retention** — auto-prune runs older than N days (configurable, checked every 6h)
- **Data export** — CSV/JSON download via `/api/export`
- **Authentication** — session-based login, changeable credentials
- **Automated backups** — daily SQLite VACUUM INTO backup, keeps last 30, manual trigger via `/api/backup`
- **Docker** — multi-stage build, docker-compose with SQLite volume

## Architecture

```
Next.js 16 (app router, src dir, TypeScript, Tailwind)
├─ src/lib/
│   ├─ db.ts           — SQLite via better-sqlite3 (runs, page_states, endpoints, settings, connectors)
│   ├─ auth.ts         — session-based auth
│   ├─ poller.ts       — BotCake API polling (60s interval)
│   ├─ connector-poller.ts — generic REST connector polling
│   ├─ scheduler.ts    — scheduled refresh + backup + data retention
│   ├─ sse.ts          — Server-Sent Events broadcast
│   ├─ botcake.ts      — BotCake API client
│   ├─ backup.ts       — VACUUM INTO backup with rotation
│   └─ notify.ts       — Slack webhook alerts with dedup
├─ src/app/
│   ├─ (dashboard)/    — protected routes (Overview, Pages, Runs, Settings)
│   ├─ login/          — login page
│   └─ api/            — REST API endpoints
├─ src/components/     — Client components
├─ Dockerfile          — multi-stage standalone build
├─ docker-compose.yml  — app + SQLite volume
├─ ecosystem.config.js — pm2 config
├─ Caddyfile           — Caddy reverse proxy template
└─ scripts/
    ├─ install-service.sh  — systemd service installer
    ├─ setup-proxy.sh      — Caddy installer + config
    └─ backup.sh           — cron-ready SQLite backup
```

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/ingest` | Ingest monitoring snapshot (X-Api-Key auth) |
| POST | `/api/run` | Trigger manual platform refresh |
| GET | `/api/runs` | List runs (endpoint_id, limit, offset filters) |
| GET | `/api/export` | Export runs as CSV or JSON |
| GET | `/api/sse` | Server-Sent Events stream |
| POST | `/api/prune` | Manually prune old runs |
| POST | `/api/backup` | Trigger database backup |
| GET | `/api/settings` | Get settings (retention_days) |
| POST | `/api/settings` | Update settings |
| POST | `/api/connectors` | Create/update platform connector |
| GET | `/api/connectors` | List platform connectors |
| DELETE | `/api/connectors/[id]` | Delete connector |
| POST | `/api/login` | Authenticate |
| POST | `/api/logout` | End session |
| POST | `/api/change-password` | Update credentials |
| POST | `/api/notify-settings` | Save Slack webhook |
| GET | `/api/notify-settings` | Get Slack webhook status |
| POST | `/api/check-alerts` | Re-evaluate alerts against latest run |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port, default 3001 |
| `FB_ACCESS_TOKEN` | Facebook Graph API token (for BotCake page name resolution) |

## Deployment

### Docker (recommended)

```bash
docker compose up -d
```

### Bare metal

```bash
npm run build
npm start
```

### Production (systemd + Caddy)

```bash
# Install as a systemd service with Caddy reverse proxy + auto SSL
sudo ./scripts/install-service.sh
sudo ./scripts/setup-proxy.sh monitor.yourdomain.com
```

### pm2

```bash
npm run build
pm2 start ecosystem.config.js
```
