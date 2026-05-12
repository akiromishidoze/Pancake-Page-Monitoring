# Roadmap

## High Priority

- [ ] **Deploy properly** — Dockerfile + docker-compose (Next.js + SQLite volume), pm2/systemd for process management, Nginx/Caddy reverse proxy with automatic SSL
- [ ] **Backup the SQLite database** — daily cron or built-in scheduler to dump `/data/monitor.sqlite` to S3, Dropbox, or local rotating archive
- [ ] **Changeable credentials** — add "Change Password" option in Settings so you're not stuck with admin/admin

## Medium Priority

- [ ] **Alerting / Notifications** — Slack webhook or email (SendGrid/Resend) when canary goes down, outage suspected, alert count > 0, or page flapping detected
- [ ] **Real-time updates (SSE)** — replace 60s AutoRefresh polling with Server-Sent Events; UI updates instantly when poller inserts new data
- [ ] **Multi-platform polling API** — add generic "Platform Connector" config (URL template, auth header, JSON path mapping, per-platform interval); currently only BotCake has direct API polling
- [ ] **Run history page** — add `/runs` page showing run history, filterable by platform, with drill-down

## Nice to Have

- [ ] **Data retention / cleanup** — auto-prune runs older than N days (setting-controlled); prevents unbounded SQLite growth
- [ ] **Export / CSV download** — `/api/export` for all runs or per-platform
- [ ] **Readme / docs update** — current README references n8n and old architecture; update to reflect standalone SaaS status
