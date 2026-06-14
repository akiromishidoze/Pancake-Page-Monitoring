// POST /api/backup — trigger a manual SQLite backup
// GET  /api/backup — list recent backups

import { NextResponse } from 'next/server';
import { withAuth, requireApiAuth } from '@/lib/auth';
import { rateLimitRoute } from '@/lib/rate-limit-guard';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { backup } from '@/lib/backup';
import { logAuditEntry } from '@/lib/db';

export const POST = withAuth(async (req: Request) => {
    const ip = getClientIp(req);
    const rateLimited = await rateLimit(ip, { store: 'backup', windowMs: 120_000, max: 2 });
    if (rateLimited) return rateLimited;

    const result = await backup();
    const detail = result.remote_key
      ? `Manual backup created (${result.size_kb} KB, remotely uploaded)`
      : `Manual backup created (${result.size_kb} KB)`;

    void logAuditEntry('trigger_backup', 'system', 'backup', detail, ip);

    return NextResponse.json({ ok: true, file: result.file, size_kb: result.size_kb, remote_key: result.remote_key });
});

export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth) return auth;
  const rl = await rateLimitRoute(req); if (rl) return rl;
  const fs = await import('fs');
  const path = await import('path');
  const BACKUPS_DIR = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('monitor_') && f.endsWith('.dump'))
    .sort()
    .reverse()
    .map((f: string) => {
      const stats = fs.statSync(path.join(BACKUPS_DIR, f));
      return { file: f, size_kb: (stats.size / 1024).toFixed(1), created_at: stats.mtime.toISOString() };
    });

  let remote: { key: string; size: number; lastModified: string }[] = [];
  try {
    const { listRemoteBackups } = await import('@/lib/remote-backup');
    remote = (await listRemoteBackups()).map(r => ({
      key: r.key,
      size: r.size,
      lastModified: r.lastModified.toISOString(),
    }));
  } catch {
    // remote listing is best-effort
  }

  return NextResponse.json({ ok: true, backups: files, remote_backups: remote });
}
