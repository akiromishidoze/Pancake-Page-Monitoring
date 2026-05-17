import Database from 'better-sqlite3';
import pg from 'pg';
import { parse } from 'pg-connection-string';
import { performance } from 'node:perf_hooks';

const SQLITE_PATH = '/home/jm/Desktop/BotCake Page Monitoring/data/monitor.sqlite';
const DATABASE_URL = 'postgresql://jm@/botcake_monitor';
const BATCH_SIZE = 500;

async function main() {
  const startTime = performance.now();
  console.log('=== SQLite → PostgreSQL Migration ===\n');

  const sqlite = new Database(SQLITE_PATH);
  sqlite.pragma('journal_mode = WAL');

  console.log('Connecting to PostgreSQL...');
  const parsedConn = parse(DATABASE_URL);
  const pool = new pg.Pool({
    host: parsedConn.host || '/var/run/postgresql',
    port: parsedConn.port ? parseInt(String(parsedConn.port), 10) : undefined,
    database: parsedConn.database || undefined,
    user: parsedConn.user || process.env.USER || undefined,
    ssl: false,
  });
  const client = await pool.connect();
  console.log('Connected.\n');

  try {
    // ──────────────────────────────────────────────────
    // 1. ENDPOINTS
    // ──────────────────────────────────────────────────
    console.log('Step 1/5: Migrating endpoints...');
    const sqliteEndpoints = sqlite.prepare('SELECT * FROM endpoints').all();
    console.log(`  Found ${sqliteEndpoints.length} endpoints in SQLite`);

    const pgExistingIds = (await client.query('SELECT id FROM endpoints')).rows.map(r => r.id);
    for (const pgId of pgExistingIds) {
      if (!sqliteEndpoints.some(se => se.id === pgId)) {
        console.log(`  Removing auto-created endpoint: ${pgId}`);
        await client.query('DELETE FROM endpoints WHERE id = $1', [pgId]);
      }
    }

    for (const ep of sqliteEndpoints) {
      await client.query(`
        INSERT INTO endpoints (id, name, url, api_key, access_token, shop_label, token_expires_at, is_active, created_at, last_used_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, url = EXCLUDED.url, api_key = EXCLUDED.api_key,
          access_token = EXCLUDED.access_token, shop_label = EXCLUDED.shop_label,
          token_expires_at = EXCLUDED.token_expires_at, is_active = EXCLUDED.is_active,
          created_at = EXCLUDED.created_at, last_used_at = EXCLUDED.last_used_at
      `, [ep.id, ep.name, ep.url, ep.api_key, ep.access_token, ep.shop_label,
          ep.token_expires_at, ep.is_active, ep.created_at, ep.last_used_at]);
    }
    const epCount = await client.query('SELECT COUNT(*)::int AS c FROM endpoints');
    console.log(`  ✅ Endpoints in PG: ${epCount.rows[0].c}`);

    // ──────────────────────────────────────────────────
    // 2. RUNS (batch insert)
    // ──────────────────────────────────────────────────
    console.log('\nStep 2/5: Migrating runs...');
    const totalRuns = sqlite.prepare('SELECT COUNT(*) AS c FROM runs').get().c;
    console.log(`  Found ${totalRuns} runs in SQLite`);
    if (totalRuns === 0) {
      console.log('  Skipping (0 runs)');
    } else {
      let insertedRuns = 0;
      let offset = 0;
      const runBatchSize = 500;
      const runCols = ['run_id', 'endpoint_id', 'generated_at', 'received_at', 'heartbeat_ok',
        'run_quality', 'severity', 'canary_status', 'canary_alert', 'outage_suspected',
        'alert_count', 'rule_version', 'in_maintenance_window', 'total_pages',
        'active_pages', 'inactive_pages', 'receiver_sd_size_bytes', 'raw_summary'];

      while (true) {
        const batch = sqlite.prepare(`SELECT * FROM runs LIMIT ${runBatchSize} OFFSET ${offset}`).all();
        if (batch.length === 0) break;

        const nCols = runCols.length;
        const placeholders = batch.map((_, i) =>
          `(${runCols.map((_, j) => `$${i * nCols + j + 1}`).join(', ')})`
        ).join(', ');
        const values = batch.flatMap(row => runCols.map(c => row[c] ?? null));

        try {
          await client.query(`
            INSERT INTO runs (${runCols.join(', ')})
            VALUES ${placeholders}
            ON CONFLICT (run_id) DO NOTHING
          `, values);
        } catch (err) {
          console.error(`  Error inserting runs batch at offset ${offset}: ${err.message}`);
          for (const row of batch) {
            try {
              await client.query(`
                INSERT INTO runs (${runCols.join(', ')})
                VALUES (${runCols.map((_, i) => `$${i + 1}`).join(', ')})
                ON CONFLICT (run_id) DO NOTHING
              `, runCols.map(c => row[c] ?? null));
            } catch (e2) {
              console.error(`  Error inserting run ${row.run_id}: ${e2.message}`);
            }
          }
        }

        insertedRuns += batch.length;
        offset += batch.length;
        process.stdout.write(`\r  Progress: ${insertedRuns}/${totalRuns} runs`);
      }
      console.log();
      const runCount = await client.query('SELECT COUNT(*)::int AS c FROM runs');
      console.log(`  ✅ Runs in PG: ${runCount.rows[0].c}`);
    }

    // ──────────────────────────────────────────────────
    // 3. PAGE STATES (batch insert, largest table)
    // ──────────────────────────────────────────────────
    console.log('\nStep 3/5: Migrating page_states...');
    const totalPs = sqlite.prepare('SELECT COUNT(*) AS c FROM page_states').get().c;
    console.log(`  Found ${totalPs} page_states in SQLite`);
    if (totalPs === 0) {
      console.log('  Skipping (0 page_states)');
    } else {
      const psCols = ['run_id', 'page_id', 'shop_label', 'page_name', 'activity_kind',
        'is_activated', 'is_canary', 'activation_reason', 'state_change',
        'activity_kind_change', 'hours_since_last_order',
        'hours_since_last_customer_activity', 'response_ms', 'fetch_errors',
        'generated_at', 'customer_count'];

      const psBatchSize = 500;
      let insertedPs = 0;
      const iter = sqlite.prepare('SELECT * FROM page_states').iterate();
      let buffer = [];

      for (const row of iter) {
        buffer.push(row);
        if (buffer.length >= psBatchSize) {
          const nCols = psCols.length;
          const placeholders = buffer.map((_, i) =>
            `(${psCols.map((_, j) => `$${i * nCols + j + 1}`).join(', ')})`
          ).join(', ');
          const values = buffer.flatMap(r => psCols.map(c => r[c] ?? null));

          try {
            await client.query(`
              INSERT INTO page_states (${psCols.join(', ')})
              VALUES ${placeholders}
            `, values);
          } catch (err) {
            console.error(`\n  Error inserting page_states batch: ${err.message}`);
            for (const r of buffer) {
              try {
                await client.query(`
                  INSERT INTO page_states (${psCols.join(', ')})
                  VALUES (${psCols.map((_, i) => `$${i + 1}`).join(', ')})
                `, psCols.map(c => r[c] ?? null));
              } catch (e2) {
                console.error(`  Error inserting page_state (run=${r.run_id}, page=${r.page_id}): ${e2.message}`);
              }
            }
          }

          insertedPs += buffer.length;
          buffer = [];
          process.stdout.write(`\r  Progress: ${insertedPs}/${totalPs} page_states`);
        }
      }

      if (buffer.length > 0) {
        const nCols = psCols.length;
        const placeholders = buffer.map((_, i) =>
          `(${psCols.map((_, j) => `$${i * nCols + j + 1}`).join(', ')})`
        ).join(', ');
        const values = buffer.flatMap(r => psCols.map(c => r[c] ?? null));
        try {
          await client.query(`
            INSERT INTO page_states (${psCols.join(', ')})
            VALUES ${placeholders}
          `, values);
        } catch (err) {
          console.error(`\n  Error inserting final page_states batch: ${err.message}`);
        }
        insertedPs += buffer.length;
        process.stdout.write(`\r  Progress: ${insertedPs}/${totalPs} page_states`);
      }

      console.log();
      const psCount = await client.query('SELECT COUNT(*)::int AS c FROM page_states');
      console.log(`  ✅ Page states in PG: ${psCount.rows[0].c}`);
    }

    // ──────────────────────────────────────────────────
    // 4. SETTINGS (merge)
    // ──────────────────────────────────────────────────
    console.log('\nStep 4/5: Migrating settings...');
    const sqliteSettings = sqlite.prepare('SELECT * FROM settings').all();
    console.log(`  Found ${sqliteSettings.length} settings in SQLite`);

    for (const s of sqliteSettings) {
      await client.query(`
        INSERT INTO settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `, [s.key, s.value]);
    }
    const sCount = await client.query('SELECT COUNT(*)::int AS c FROM settings');
    console.log(`  ✅ Settings in PG: ${sCount.rows[0].c}`);

    // ──────────────────────────────────────────────────
    // 5. PLATFORM PAGES
    // ──────────────────────────────────────────────────
    console.log('\nStep 5/6: Migrating platform_pages...');
    const sqlitePages = sqlite.prepare('SELECT * FROM platform_pages').all();
    console.log(`  Found ${sqlitePages.length} platform_pages in SQLite`);

    for (const p of sqlitePages) {
      await client.query(`
        INSERT INTO platform_pages (id, endpoint_id, page_name, page_url, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          endpoint_id = EXCLUDED.endpoint_id, page_name = EXCLUDED.page_name,
          page_url = EXCLUDED.page_url, is_active = EXCLUDED.is_active,
          created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
      `, [p.id, p.endpoint_id, p.page_name, p.page_url, p.is_active, p.created_at, p.updated_at]);
    }
    const ppCount = await client.query('SELECT COUNT(*)::int AS c FROM platform_pages');
    console.log(`  ✅ Platform pages in PG: ${ppCount.rows[0].c}`);

    // ──────────────────────────────────────────────────
    // 6. PLATFORM CONNECTORS
    // ──────────────────────────────────────────────────
    console.log('\nStep 6/6: Migrating platform_connectors...');
    const sqliteConnectors = sqlite.prepare('SELECT * FROM platform_connectors').all();
    console.log(`  Found ${sqliteConnectors.length} platform_connectors in SQLite`);

    for (const c of sqliteConnectors) {
      await client.query(`
        INSERT INTO platform_connectors (id, name, platform_type, api_url, auth_header, auth_token, json_path, interval_ms, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, platform_type = EXCLUDED.platform_type,
          api_url = EXCLUDED.api_url, auth_header = EXCLUDED.auth_header,
          auth_token = EXCLUDED.auth_token, json_path = EXCLUDED.json_path,
          interval_ms = EXCLUDED.interval_ms, is_active = EXCLUDED.is_active,
          created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
      `, [c.id, c.name, c.platform_type, c.api_url, c.auth_header, c.auth_token,
          c.json_path, c.interval_ms, c.is_active, c.created_at, c.updated_at]);
    }
    const connCount = await client.query('SELECT COUNT(*)::int AS c FROM platform_connectors');
    console.log(`  ✅ Platform connectors in PG: ${connCount.rows[0].c}`);

    // ──────────────────────────────────────────────────
    // VERIFICATION
    // ──────────────────────────────────────────────────
    console.log('\n=== Verification ===');
    const tables = ['endpoints', 'runs', 'page_states', 'platform_pages', 'settings', 'platform_connectors'];
    let allMatch = true;

    for (const table of tables) {
      const sqliteCount = sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
      const pgResult = await client.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
      const pgCount = pgResult.rows[0].c;
      const status = sqliteCount === pgCount ? '✅ MATCH' : '❌ MISMATCH';
      if (sqliteCount !== pgCount) allMatch = false;
      console.log(`  ${status} | ${table.padEnd(20)} | SQLite: ${String(sqliteCount).padStart(8)} | PG: ${String(pgCount).padStart(8)}`);
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`\nCompleted in ${elapsed}s`);
    if (allMatch) {
      console.log('All counts match!');
    } else {
      console.log('Some counts differ — investigate above.');
    }

  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
