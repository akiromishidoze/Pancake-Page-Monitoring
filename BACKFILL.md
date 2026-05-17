# Backfill

The built-in platform poller (`src/lib/poller.ts`) automatically refreshes
monitored platforms (e.g. BotCake) every 60 seconds and persists snapshots
to the PostgreSQL database.

If you need to import historical data, POST snapshots to `/api/ingest`
(authenticated with `X-Api-Key` matching a configured endpoint).

For future reference, the ingest endpoint accepts the same snapshot format
as described in the `insertSnapshot` function in `src/lib/db.ts`.
