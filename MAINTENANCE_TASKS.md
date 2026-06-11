# Maintenance Tasks

> Generated: 2026-06-11
> 33 items across 4 priority levels

---

## 🔴 Critical (8)

- [ ] **CSRF enforcement** — `checkCsrf()` exists in `src/lib/csrf.ts` but no route handler calls it. All state-changing API routes lack cross-origin protection.
- [ ] **CSRF token mechanism** — replace or supplement Origin/Referer check with a double-submit cookie or token pattern.
- [ ] **Rate-limit race condition** — `rateLimit()` read-then-write without DB locking; concurrent requests can exceed `max`. (`src/lib/rate-limit.ts:58-83`)
- [ ] **Session cookie hardening** — add `__Host-` prefix and `partitioned` attribute to login cookie. (`src/app/api/login/route.ts:64-70`)
- [ ] **API keys encryption** — `api_key` and `access_token` stored in plaintext in the `endpoints` table. (`src/lib/db.ts:118-128`)
- [x] **HTTP security headers** — add CSP, HSTS, X-Frame-Options, X-Content-Type-Options (via middleware or next.config).
- [x] **Rate limit all API routes** — only login and ingest are protected; 30+ routes have no rate limiting.
- [x] **Ingest IP allowlist CIDR support** — replace string-exact match with proper CIDR matching. (`src/app/api/ingest/route.ts:17-21`)

## 🟠 High (7)

- [ ] **Request body size validation** — reject oversized payloads before parsing JSON. (All POST routes)
- [ ] **`ensureMigrated()` call overhead** — redundant on every query after startup. (`src/lib/db.ts:42-52`)
- [ ] **Migration race condition** — `migratePartitionColumnTypes()` runs outside the versioned migration system. (`src/lib/db.ts:501-512`)
- [ ] **SSE backpressure** — slow SSE consumers can cause memory growth. (`src/lib/sse.ts`)
- [ ] **Partition cache never invalidated** — `_partitionCache` misses externally-created partitions until restart. (`src/lib/db.ts:514-538`)
- [ ] **DB query timeout** — `pool.query` calls lack client-side AbortSignal. A slow query ties up a connection until DB kills it. (`src/lib/db.ts`)
- [ ] **Lockout escalation** — after 5+ lockouts stays at 24h forever with no permanent lock or admin unlock endpoint. (`src/lib/lockout.ts:7-13`)

## 🟡 Medium (11)

- [ ] **React error boundaries** — wrap page sections. A component crash currently takes down the whole page. (All `page.tsx`)
- [ ] **API response caching** — add ETags or `stale-while-revalidate` to reduce DB load on 60s polling. (All `route.ts`)
- [ ] **Loading skeletons** — add skeleton/shimmer states during data fetch. (All `page.tsx`)
- [ ] **Accessibility** — proper `alt` text on images, `aria-label` on interactive elements, keyboard nav for tables. (`TwoFactorSetup.tsx`, `Sidebar.tsx`, `SearchablePageTable.tsx`)
- [ ] **ESLint warnings** — resolve 111 remaining warnings (~50 `any`, ~35 unused vars, 6 hook deps).
- [ ] **Schema standardization** — replace `toSlimPage()` field normalization with a consistent schema. (`src/lib/db.ts:568-587`)
- [ ] **SQL injection surface** — replace `${table}` string interpolation with safe quoting. (`src/lib/db.ts:275,298-301`)
- [ ] **TypeScript strictness** — enable `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes`. (`tsconfig.json`)
- [ ] **Read/write pool separation** — separate DB pool config for read vs write queries. (`src/lib/db.ts:28`)
- [ ] **Server Components** — migrate client components to RSC where possible for better perf.
- [ ] **Strict `SlimPage` types** — reduce optional fields to improve type safety downstream. (`src/lib/db.ts:543-566`)

## ⚪ Low (7)

- [ ] **Test gaps** — 21 test files (good lib coverage) but only 3 API route tests and 3 component tests. No tests for scheduler, backup, 30+ API routes.
- [ ] **Graceful shutdown timer** — replace hardcoded 8s with env var or PM2-derived value. (`src/instrumentation.ts:113-116`)
- [ ] **Poller interval configurable** — hardcoded 60s; should be env-configurable. (`src/lib/poller.ts:11`)
- [ ] **Logger lazy init** — pino-pretty transport loads on import, not on first use. (`src/lib/logger.ts:3-5`)
- [ ] **Health check scope** — verify `/api/health` checks DB connectivity. (`src/app/api/health/route.ts`)
- [ ] **Error code catalog** — document all `ErrorCodes` for API consumers. (`src/lib/errors.ts`)
- [ ] **TypeScript target bump** — `ES2017` → `ES2022` for modern Node runtime optimizations. (`tsconfig.json:3`)
