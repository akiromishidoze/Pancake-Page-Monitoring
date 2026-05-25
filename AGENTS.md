<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: BotCake Page Monitoring Dashboard

## Architecture
- Standalone multi-endpoint SaaS (no n8n dependency for data fetching)
- Next.js 16 app with PostgreSQL (node-postgres), PM2 process manager on port 3001
- Built-in poller (`src/lib/poller.ts`) refreshes BotCake/Pancake data every 60s automatically
- Shared ingest webhook `POST /api/ingest` authenticates via X-Api-Key against `endpoints` table
- n8n is fully optional — used only if external systems push to `/api/ingest`

## Database (PostgreSQL via pg, `DATABASE_URL`)
- `endpoints`, `runs`, `page_states` (RANGE-partitioned by `generated_at`), `settings`, `platform_pages`, `platform_connectors`, `sessions`, `botcake_overrides`, `audit_log`
- All timestamp columns are `TIMESTAMPTZ`, all boolean columns are `BOOLEAN`
- Migrations in `db.ts`: `migrate()` → `migrateTimestampTypes()` → `migrateBooleanTypes()` → `migratePageStatesPartitioning()` → `migrateBotCakeOverrides()`

## Tables
| Table | Key Columns | Notes |
|---|---|---|
| endpoints | id (TEXT PK), name, url, api_key, access_token, shop_label, is_active | 4 rows: 3 Pancake shops + 1 BotCake Platform |
| runs | run_id (TEXT PK), endpoint_id (FK), generated_at (TIMESTAMPTZ), health metrics | Per-endpoint snapshots |
| page_states | RANGE-partitioned by generated_at (monthly); id (SERIAL), run_id (FK), page_id, is_activated | Partitioned; partitions auto-created ±3/+6 months |
| platform_pages | id (TEXT PK), endpoint_id (FK CASCADE), page_name, page_url, is_active | User-managed CRUD pages |
| settings | key (TEXT PK), value | Config values |
| sessions | token (TEXT PK), role (TEXT DEFAULT 'admin'), created_at (TIMESTAMPTZ), expires_at (TIMESTAMPTZ) | 7-day TTL, multi-token |
| botcake_overrides | page_id (TEXT PK), is_active (BOOLEAN), reason (TEXT), created_at (TIMESTAMPTZ) | Manual page overrides |
| audit_log | id (SERIAL PK), action (TEXT), entity_type, entity_id, detail, ip_address, created_at (TIMESTAMPTZ) | Settings change tracking |
| platform_connectors | id (TEXT PK), name, platform_type, api_url, is_active | External data connectors |

## Key Libraries
- `@/lib/db.ts`: PostgreSQL CRUD + migrations (timestamps, booleans, partitioning, sessions, overrides, audit_log)
- `@/lib/botcake.ts`: BotCake API fetcher (list_page_id pagination + Facebook/DB name lookup)
- `@/lib/poller.ts`: Built-in BotCake/Pancake poller (60s interval, auto-refreshes)
- `@/lib/scheduler.ts`: DB backup + prune + platform refresh + poller health check
- `@/lib/connector-poller.ts`: Polls external connectors for page data
- `@/lib/auth.ts`: Session-based authentication (bcrypt, multi-session via DB)
- `@/lib/notify.ts`: Slack + Email (nodemailer) alerting with dedup
- `@/lib/backup.ts`: PostgreSQL pg_dump backup with rotation
- `@/lib/sse.ts`: Server-Sent Events broadcast
- `@/lib/format.ts`: Timezone-aware date formatting (`formatWithTz`, `formatDateWithTz`)
- `@/lib/http.ts`: HTTP agent initialization

## API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/ingest` | POST | Standalone ingest webhook (X-Api-Key auth) |
| `/api/botcake-refresh` | GET/POST | Manual/external trigger for BotCake refresh |
| `/api/endpoints` | GET/POST | Endpoint CRUD |
| `/api/endpoints/[id]` | PUT/DELETE | Update/delete endpoint |
| `/api/platform-pages` | GET/POST | Platform page CRUD |
| `/api/platform-pages/[id]` | PUT/DELETE | Update/delete platform page |
| `/api/connectors` | GET/POST | Connector CRUD |
| `/api/connectors/[id]` | DELETE | Delete connector |
| `/api/run` | POST | Trigger manual poller refresh |
| `/api/runs` | GET | List runs with pagination |
| `/api/status` | GET | Status + lazy cron trigger |
| `/api/settings` | GET/POST | Get/set retention_days |
| `/api/schedule` | GET/POST | Get/set schedule interval |
| `/api/backup` | POST/GET | Trigger backup / list backups |
| `/api/prune` | POST | Manually prune old runs |
| `/api/backfill` | GET | Backfill info (automatic via poller) |
| `/api/export` | GET | Export runs as CSV/JSON |
| `/api/login` | POST | Authenticate (rate-limited: 10/min/IP) |
| `/api/logout` | POST | End session |
| `/api/change-password` | POST | Update credentials |
| `/api/notify-settings` | GET/POST | Get/set Slack webhook + SMTP/email settings |
| `/api/check-alerts` | POST | Re-evaluate alerts |
| `/api/test-notification` | POST | Send test Slack notification |
| `/api/test-email-notification` | POST | Send test email notification |
| `/api/sse` | GET | Server-Sent Events stream |
| `/api/health` | GET | Health check (unauthenticated) |
| `/api/botcake-export` | GET | Export BotCake pages as CSV |
| `/api/botcake-override` | POST | Set/clear BotCake manual override |
| `/api/pancake/pages` | GET | Fetch live Pancake pages |

## Pages
| Route | Purpose |
|---|---|
| `/` | Overview — StatusCards + PancakeSection + BotCakeSection + DB stats + Run details |
| `/pages` | Platform listing (filtered, excludes BotCake) |
| `/pages/platform/[slug]` | Dynamic per-platform page (Pancake tabbed vs BotCake flat table) |
| `/pages/[pageId]` | Individual page history (SLA, uptime, incidents, response time) |
| `/runs` | Run history with pagination and platform filter |
| `/settings` | Endpoints, connectors, notifications (Slack + Email), data retention, credentials |

## Data Flow
- **BotCake**: Built-in poller fetches from BotCake API + Facebook Graph API every 60s, stores via `insertSnapshot` with `endpoint_id: 'botcake-platform'`
- **Pancake**: Built-in poller fetches from Pancake API (shops/pages/orders/customers) every 60s, stores as runs + page_states. External `POST /api/ingest` also accepted for n8n-based workflows.
- **Overview**: All data reads from PostgreSQL via `db.ts` functions. Dynamic endpoint IDs (no hardcoded shop IDs).
- **Pages**: All reads from PostgreSQL via `db.ts`. Timezone shown via `formatWithTz()` utility.

## Behavior Changes
- BotCake data is NEVER fetched live on page visit — only via the 60s poller or `/api/botcake-refresh` endpoint
- `ShopCompare.tsx`, `PageFilters.tsx` deleted (unused)
- Sidebar nav data-driven from a single `navItems` array (no desktop/mobile duplication)
- Env vars validated on startup in `instrumentation.ts` (`DATABASE_URL` required, `FB_ACCESS_TOKEN` optional)
