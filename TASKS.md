# Page Monitor — Enhancement Task List

## Done
- T1#1 — Missing `await` in botcake-override route
- T1#2 — `pruneOldRuns` partition/DELETE redundancy (reorder: delete runs first, then drop partitions)
- T1#3 — Misleading column types (`INTEGER` → `BOOLEAN`, `migratePartitionColumnTypes()`)
- T1#4 — Module-level rate-limit state → concurrency guards (`_refreshingBotCake`/`_refreshingPancake`)
- T2#5 — SSE dead-client eviction (30s probe interval)
- T2#6 — Endpoint-scoped SSE events (`?scope=` param, per-client filtering)
- T2#7 — SSE reconnection backoff (exponential + jitter, 1s→30s max)
- T2#8 — `router.refresh()` timing (broadcast moved to `refreshAll()` after all refreshes complete)
- ChunkReload — catches stale-chunk errors and auto-reloads
- T3#9 — Batch page INSERT in `insertSnapshot` (individual → bulk multi-row)
- T3#10 — `getLatestPageStates` sequential scan on partitioned table (added `::timestamptz` filter)
- T3#11 — Dashboard page 8+ sequential DB queries → parallelized via `Promise.all`
- T3#12 — `ensureMonthlyPartitions()` queries `pg_inherits` on every insert → `_partitionCache`
- T3#13 — No connection pool tuning → added `connectionTimeoutMillis: 10_000`, `idleTimeoutMillis: 30_000`
- T3#14 — Loading skeletons per dashboard section (`<Suspense>` boundaries with skeleton fallbacks)
- T3#15 — EndpointFilter dropdown resets on SSE-driven `router.refresh()` (useState + useEffect synced to searchParams)

## Remaining

### Tier 4 — Frontend UX
- T4#16 — Error boundaries per dashboard section
- T4#17 — BotCakePageList Override status invisible until next refresh
- T4#18 — Run history page has no loading state during pagination

### Tier 5 — Security
- T5#19 — No Secure flag on session cookie
- T5#20 — No CSRF protection on state-changing endpoints
- T5#21 — `/api/ingest` no IP allowlist or rate limiting, CORS wildcard
- T5#22 — Encryption key falls back to `DATABASE_URL`
- T5#23 — Zod schemas defined but only used on `/api/ingest`
- T5#24 — Session token exposed in URL? (check proxy redirect)

### Tier 6 — Observability
- T6#25 — Error responses unstructured — no error codes
- T6#26 — No request logging middleware
- T6#27 — Alert dedup uses settings table writes
- T6#28 — audit_log table never queried in UI
- T6#29 — Health check doesn't test DB connectivity

### Tier 7 — Testing
- T7#30 — Zero tests for API routes
- T7#31 — Zero tests for poller
- [x] T7#32 — Zero tests for DB
- [x] T7#33 — Zero tests for alerts

### Tier 8 — Infrastructure
- [x] T8#34 — Docker healthcheck (replace curl with pg_isready or node script)
- [ ] T8#35 — pg_dump flag audit (fix --clean --if-exists deprecation)
- [ ] T8#36 — PM2 log directory config
- [x] T8#37 — Graceful shutdown on SIGTERM/SIGINT
- [ ] T8#38 — CORS audit (verify allowed origins match production)
- [ ] T8#39 — Rate-limit tuning (adjust per-route limits)
- [ ] T8#40 — Env var validation (warn on missing optional vars at startup)
- [ ] T8#41 — Cache-Control headers on API responses
- [ ] T8#42 — Session cleanup cron job
- [ ] T8#43 — Request size limits
- [ ] T8#44 — Version endpoint (GET /api/version)
- [x] T8#45 — Asset fingerprinting for static files (Handled by Next.js)
