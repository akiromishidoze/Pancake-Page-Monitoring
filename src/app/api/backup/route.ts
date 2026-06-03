// POST /api/backup — trigger a manual SQLite backup
// GET  /api/backup — list recent backups

import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { pool } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { requireApiAuth } from '@/lib/auth';
import { backup } from '@/lib/backup';

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    const rateLimited = rateLimit(getClientIp(req), { store: 'backup', max: 2 });
    if (rateLimited) return rateLimited;

    const backupFile = await backup();
    const fs = await import('fs');
    const stats = fs.statSync(backupFile);
    const sizeKb = (stats.size / 1024).toFixed(1);

    return NextResponse.json({ ok: true, file: backupFile, size_kb: sizeKb });
  } catch (e) {
    return apiCatch(e);
  }
}

export async function GET() {
  const auth = await requireApiAuth();
  if (auth) return auth;
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
