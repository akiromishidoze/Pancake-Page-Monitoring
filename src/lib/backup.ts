import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const BACKUPS_DIR = path.join(process.cwd(), 'backups');

export async function backup(): Promise<string> {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUPS_DIR, `monitor_${timestamp}.sql`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  await execAsync(`pg_dump --clean --if-exists --no-owner --no-privileges "${dbUrl}" > "${backupFile}"`);

  // Keep only last 30 backups
  const files = (await fs.readdir(BACKUPS_DIR))
    .filter(f => f.startsWith('monitor_') && f.endsWith('.sql'))
    .sort()
    .reverse();
  for (const old of files.slice(30)) {
    await fs.unlink(path.join(BACKUPS_DIR, old));
  }

  return backupFile;
}
