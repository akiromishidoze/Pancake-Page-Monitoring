# Page Monitor — Remaining Tasks

## Frontend UX

1. **T4#16** — Error boundaries per dashboard section ✓
2. **T4#17** — BotCakePageList: override status invisible until next refresh ✓
3. **T4#18** — Run history page: no loading state during pagination

## Security

4. **T5#19** — Missing `Secure` flag on session cookie
5. **T5#20** — No CSRF protection on state-changing endpoints
6. **T5#21** — `/api/ingest`: no IP allowlist / rate limiting, CORS wildcard
7. **T5#22** — Encryption key falls back to `DATABASE_URL`
8. **T5#23** — Zod schemas defined but unused on most routes
9. **T5#24** — Session token potentially exposed in URL (proxy redirect)

## Observability

10. **T6#25** — Error responses unstructured (no error codes)
11. **T6#26** — No request logging middleware
12. **T6#27** — Alert dedup uses settings table writes
13. **T6#28** — `audit_log` table never queried in UI
14. **T6#29** — Health check doesn't test DB connectivity

## Testing

15. **T7#30** — Zero tests for API routes
16. **T7#31** — Zero tests for poller

## Infrastructure

17. **T8#35** — `pg_dump` flag audit (fix `--clean --if-exists` deprecation)
18. **T8#36** — PM2 log directory configuration
19. **T8#38** — CORS audit (verify allowed origins match production)
20. **T8#39** — Rate-limit tuning (adjust per-route limits)
21. **T8#40** — Env var validation (warn on missing optional vars at startup)
22. **T8#41** — Cache-Control headers on API responses
23. **T8#42** — Session cleanup cron job
24. **T8#43** — Request size limits
25. **T8#44** — Version endpoint (`GET /api/version`)
