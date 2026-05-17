<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: BotCake Page Monitoring Dashboard

## Architecture
- Standalone multi-endpoint SaaS (no n8n dependency for data fetching)
- Next.js 16 app with PostgreSQL (node-postgres), Turbopack dev server on port 3001
- Built-in poller (`src/lib/poller.ts`) refreshes BotCake data every 60s automatically
- Shared ingest webhook `POST /api/ingest` authenticates via X-Api-Key against `endpoints` table
- n8n is fully optional — used only if external systems push to `/api/ingest`

## Database (PostgreSQL via pg, `DATABASE_URL`)
- `endpoints` — configured data sources (id, name, url, api_key, access_token, shop_label, token_expires_at, is_active, created_at, last_used_at)
- `runs` — one row per snapshot (run_id, endpoint_id FK, generated_at, received_at, health fields)
- `page_states` — one row per (run × page) for fast per-page queries (FK to runs)
- `platform_pages` — user-managed pages per endpoint (FK to endpoints, CASCADE delete)
- `settings` — key/value store

## Tables
| Table | Key Columns | Notes |
|---|---|---|
| endpoints | id (TEXT PK), name, url, api_key, access_token, shop_label, is_active | 4 rows: 3 Pancake shops + 1 BotCake Platform |
| runs | run_id (TEXT PK), endpoint_id (FK), generated_at, received_at, health metrics | Per-endpoint snapshots |
| page_states | id (INTEGER PK), run_id (FK), page_id, shop_label, page_name, activity_kind, is_activated | Latest run per endpoint |
| platform_pages | id (TEXT PK), endpoint_id (FK CASCADE), page_name, page_url, is_active | User-managed CRUD pages |
| settings | key (TEXT PK), value | Config values |

## Key Libraries
- `@/lib/db.ts`: PostgreSQL CRUD + slugify helpers
- `@/lib/botcake.ts`: BotCake API fetcher (list_page_id pagination + Facebook/DB name lookup)
- `@/lib/poller.ts`: Built-in BotCake poller (60s interval, auto-refreshes)
- `@/lib/scheduler.ts`: DB backup + prune + platform refresh trigger
- `@/lib/connector-poller.ts`: Polls external connectors for page data
- `@/lib/auth.ts`: Session-based authentication (login, validate, logout)
- `@/lib/notify.ts`: Slack webhook alerting with dedup
- `@/lib/backup.ts`: PostgreSQL pg_dump backup with rotation
- `@/lib/sse.ts`: Server-Sent Events broadcast

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
| `/api/login` | POST | Authenticate |
| `/api/logout` | POST | End session |
| `/api/change-password` | POST | Update credentials |
| `/api/notify-settings` | GET/POST | Get/set Slack webhook |
| `/api/check-alerts` | POST | Re-evaluate alerts |
| `/api/test-notification` | POST | Send test Slack notification |
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
| `/settings` | Endpoints, connectors, notifications, data retention, credentials |

## Data Flow
- **BotCake**: Built-in poller fetches from BotCake API + Facebook Graph API every 60s, stores via `insertSnapshot` with `endpoint_id: 'botcake-platform'`
- **Pancake**: Built-in poller fetches from Pancake API (shops/pages/orders/customers) every 60s, stores as runs + page_states. External `POST /api/ingest` also accepted for n8n-based workflows.
- **Overview**: All data reads from PostgreSQL via `db.ts` functions. BotCakeSection uses `getLatestPageStates('botcake-platform')`, PancakeSection uses per-endpoint queries.
- **Pages**: All reads from PostgreSQL via `db.ts`.

## Behavior Changes
- BotCake data is NEVER fetched live on page visit — only via the 60s poller or `/api/botcake-refresh` endpoint
- `ShopCompare.tsx`, `PageFilters.tsx` deleted (unused)
