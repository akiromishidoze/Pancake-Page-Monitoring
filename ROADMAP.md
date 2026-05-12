# Roadmap

## High Priority

- [x] **Deploy properly** — Dockerfile + docker-compose (Next.js + SQLite volume)
- [x] **Process management** — pm2 ecosystem.config.js, systemd service script (`scripts/install-service.sh`), Caddy reverse proxy with auto SSL (`Caddyfile`, `scripts/setup-proxy.sh`)
- [x] **Backup the SQLite database** — daily cron or built-in scheduler (`/api/backup`, auto every 24h, keeps last 30)
- [x] **Changeable credentials** — "Login Credentials" form in Settings, stores in settings table

## Medium Priority

- [x] **Alerting / Notifications** — Slack webhook when canary goes down, outage suspected, alert count ≥ 3, run quality degraded, or heartbeat stale
- [x] **Real-time updates (SSE)** — `/api/sse` endpoint pushes refresh events; AutoRefresh replaced with EventSource listener; poller and ingest both broadcast on insert
- [x] **Multi-platform polling API** — `platform_connectors` table + CRUD API + Settings UI (`ConnectorsSettings` component) + generic connector poller (`connector-poller.ts`)
- [x] **Run history page** — `/runs` page with platform filter, pagination; `/api/runs` API with offset/limit/endpoint_id filters

## Nice to Have

- [x] **Data retention / cleanup** — retention_days setting, auto-prune every 6h in scheduler, manual prune via Settings UI (`DataRetentionSettings` component), `/api/prune` endpoint
- [x] **Export / CSV download** — `/api/export` (format=csv|json, endpoint_id filter, limit). CSV download link already on per-page detail view
- [x] **Readme / docs update** — updated to reflect standalone SaaS status with architecture, API docs, deployment guides
