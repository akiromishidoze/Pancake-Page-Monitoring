# Roadmap

## High Priority

- [x] **Deploy properly** — Dockerfile + docker-compose (Next.js + SQLite volume)
- [ ] **Process management** — pm2/systemd for production, Nginx/Caddy reverse proxy with automatic SSL
- [x] **Backup the SQLite database** — daily cron or built-in scheduler (`/api/backup`, auto every 24h, keeps last 30)
- [x] **Changeable credentials** — "Login Credentials" form in Settings, stores in settings table

## Medium Priority

- [ ] **Alerting / Notifications** — Slack webhook or email (SendGrid/Resend) when canary goes down, outage suspected, alert count > 0, or page flapping detected
- [ ] **Real-time updates (SSE)** — replace 60s AutoRefresh polling with Server-Sent Events; UI updates instantly when poller inserts new data
- [ ] **Multi-platform polling API** — add generic "Platform Connector" config (URL template, auth header, JSON path mapping, per-platform interval); currently only BotCake has direct API polling
- [ ] **Run history page** — add `/runs` page showing run history, filterable by platform, with drill-down

## Nice to Have

- [ ] **Data retention / cleanup** — auto-prune runs older than N days (setting-controlled); prevents unbounded SQLite growth
- [ ] **Export / CSV download** — `/api/export` for all runs or per-platform
- [ ] **Readme / docs update** — current README references n8n and old architecture; update to reflect standalone SaaS status
