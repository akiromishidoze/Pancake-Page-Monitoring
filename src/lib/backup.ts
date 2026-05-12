import { getDb } from './db';
import fs from 'fs';
import path from 'path';

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

function ensureDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

export function backup(): string {
  ensureDir();
  const db = getDb();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUPS_DIR, `monitor_${timestamp}.sqlite`);

  db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);

  // Keep only last 30 backups
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('monitor_') && f.endsWith('.sqlite'))
    .sort()
    .reverse();
  for (const old of files.slice(30)) {
    fs.unlinkSync(path.join(BACKUPS_DIR, old));
  }

  return backupFile;
}
