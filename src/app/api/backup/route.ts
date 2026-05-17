// POST /api/backup — trigger a manual SQLite backup
// GET  /api/backup — list recent backups

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function POST() {
  const auth = await requireApiAuth(); if (auth) return auth;
  try {
    // PostgreSQL backup via pg_dump
    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');
    const BACKUPS_DIR = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUPS_DIR, `monitor_${timestamp}.sql`);

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL not set');

    execSync(`pg_dump "${dbUrl}" > "${backupFile}"`, { stdio: 'pipe' });

    const stats = fs.statSync(backupFile);
    const sizeKb = (stats.size / 1024).toFixed(1);

    // Keep only last 30 backups
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('monitor_') && f.endsWith('.sql'))
      .sort()
      .reverse();
    for (const old of files.slice(30)) {
      fs.unlinkSync(path.join(BACKUPS_DIR, old));
    }

    return NextResponse.json({ ok: true, file: backupFile, size_kb: sizeKb });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET() {
  const auth = await requireApiAuth(); if (auth) return auth;
  const fs = await import('fs');
  const path = await import('path');
  const BACKUPS_DIR = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('monitor_') && f.endsWith('.sql'))
    .sort()
    .reverse()
    .map((f: string) => {
      const stats = fs.statSync(path.join(BACKUPS_DIR, f));
      return { file: f, size_kb: (stats.size / 1024).toFixed(1), created_at: stats.mtime.toISOString() };
    });

  return NextResponse.json({ ok: true, backups: files });
}
