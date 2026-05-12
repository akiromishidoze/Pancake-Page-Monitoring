// POST /api/backup — trigger a manual SQLite backup
// GET  /api/backup — list recent backups

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

function ensureDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

export async function POST() {
  try {
    ensureDir();
    const db = getDb();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUPS_DIR, `monitor_${timestamp}.sqlite`);

    db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);

    const stats = fs.statSync(backupFile);
    const sizeKb = (stats.size / 1024).toFixed(1);

    // Keep only last 30 backups
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('monitor_') && f.endsWith('.sqlite'))
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
  ensureDir();
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('monitor_') && f.endsWith('.sqlite'))
    .sort()
    .reverse()
    .map(f => {
      const stats = fs.statSync(path.join(BACKUPS_DIR, f));
      return { file: f, size_kb: (stats.size / 1024).toFixed(1), created_at: stats.mtime.toISOString() };
    });

  return NextResponse.json({ ok: true, backups: files });
}
