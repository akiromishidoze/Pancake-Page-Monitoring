import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

function ensureDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

export function backup(): string {
  ensureDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUPS_DIR, `monitor_${timestamp}.sql`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  execSync(`pg_dump "${dbUrl}" > "${backupFile}"`, { stdio: 'pipe' });

  // Keep only last 30 backups
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('monitor_') && f.endsWith('.sql'))
    .sort()
    .reverse();
  for (const old of files.slice(30)) {
    fs.unlinkSync(path.join(BACKUPS_DIR, old));
  }

  return backupFile;
}
