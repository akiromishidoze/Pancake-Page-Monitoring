<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: BotCake Page Monitoring Dashboard

## Architecture
- Standalone multi-endpoint SaaS (no n8n dependency for data fetching)
- Next.js 16 app with SQLite (better-sqlite3), Turbopack dev server on port 3001
- Built-in poller (`src/lib/poller.ts`) refreshes BotCake data every 60s automatically
- Shared ingest webhook `POST /api/ingest` authenticates via X-Api-Key against `endpoints` table
- n8n is fully optional — used only if external systems push to `/api/ingest`

## Database (SQLite via better-sqlite3, `data/monitor.sqlite`)
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
- `@/lib/db.ts`: SQLite schema + CRUD + slugify helpers
- `@/lib/botcake.ts`: BotCake API fetcher (list_page_id pagination + Facebook/DB name lookup)
- `@/lib/receiver.ts`: n8n receiver fetch wrapper (still used as DB fallback)
- `@/lib/poller.ts`: Built-in BotCake poller (60s interval, auto-refreshes)
- `@/lib/scheduler.ts`: DB backup + prune + platform refresh trigger
- `@/lib/connector-poller.ts`: Polls external connectors for page data

## API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/ingest` | POST | Standalone ingest webhook (X-Api-Key auth) |
| `/api/botcake-refresh` | GET/POST | Manual/external trigger for BotCake refresh |
| `/api/endpoints` | GET/POST | Endpoint CRUD |
| `/api/platform-pages` | GET/POST | Platform page CRUD |
| `/api/run` | POST | Trigger manual poller refresh |
| `/api/status` | GET | Health check + lazy cron trigger |
| `/api/backfill` | GET | Backfill info (automatic via poller) |

## Pages
| Route | Purpose |
|---|---|
| `/` | Overview — StatusCards + PancakeSection + BotCakeSection + Receiver/Run cards |
| `/pages` | Platform listing (filters out BotCake by URL) |
| `/pages/platform/[slug]` | Dynamic per-platform page (Pancake tabbed vs BotCake flat table) |
| `/pages/[pageId]` | Individual page history |

## Data Flow
- **BotCake**: Built-in poller fetches from BotCake API + Facebook Graph API every 60s, stores via `insertSnapshot` with `endpoint_id: 'botcake-platform'`
- **Pancake**: n8n workflow (optional) POSTs to `/api/ingest` with per-shop API key, stores as runs + page_states
- **Overview**: StatusCards + PancakeSection from n8n receiver (DB fallback in `loadRows`), BotCakeSection from DB via `getLatestPageStates('botcake-platform')`
- **Platform page**: Always reads from DB via `loadRows(endpointId)` — fallback to n8n receiver if no DB data

## Behavior Changes
- BotCake data is NEVER fetched live on page visit — only via the 60s poller or `/api/botcake-refresh` endpoint
- `ShopCompare.tsx`, `PageFilters.tsx` deleted (unused)
