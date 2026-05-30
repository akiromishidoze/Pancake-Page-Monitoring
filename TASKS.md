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
- T7#32 — Zero tests for DB
- T7#33 — Zero tests for alerts

### Tier 8 — Infrastructure
- T8#34 — Docker healthcheck missing
- T8#35 — pg_dump missing `--no-owner`/`--no-privileges`
- T8#36 — DB migrations not versioned
- T8#37 — PM2 log dir not auto-created
- T8#38–45 — Various infrastructure items
