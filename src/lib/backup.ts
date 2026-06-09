import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { uploadToS3, cleanupRemoteBackups } from './remote-backup';

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

export type BackupResult = {
  file: string;
  size_kb: string;
  remote_key: string | null;
};

export async function backup(): Promise<BackupResult> {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUPS_DIR, `monitor_${timestamp}.dump`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  await new Promise<void>((resolve, reject) => {
    const dump = spawn('pg_dump', [
      '--clean',
      '--no-owner', '--no-privileges',
      '--no-comments', '--no-security-labels',
      '--no-password',
      '--format=custom', '--compress=9',
      '--dbname=' + dbUrl,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const writeStream = createWriteStream(backupFile);
    dump.stdout.pipe(writeStream);

    let stderr = '';
    dump.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    dump.on('error', (err: Error) => { writeStream.close(); reject(err); });
    writeStream.on('error', (err: Error) => { dump.kill(); reject(err); });

    dump.on('close', (code: number | null) => {
      writeStream.close();
      if (code !== 0) {
        reject(new Error(`pg_dump exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve();
      }
    });
  });

  const sizeKb = (await fs.stat(backupFile)).size / 1024;

  let remoteKey: string | null = null;
  try {
    remoteKey = await uploadToS3(backupFile);
    if (remoteKey) {
      const deleted = await cleanupRemoteBackups();
      if (deleted > 0) {
        const { createLogger } = await import('./logger');
        createLogger('backup').info('cleaned up %d old remote backup(s)', deleted);
      }
    }
  } catch (err) {
    const { createLogger } = await import('./logger');
    createLogger('backup').error({ err }, 'remote backup upload failed');
  }

  const files = (await fs.readdir(BACKUPS_DIR))
    .filter(f => f.startsWith('monitor_') && f.endsWith('.dump'))
    .sort()
    .reverse();
  for (const old of files.slice(30)) {
    await fs.unlink(path.join(BACKUPS_DIR, old));
  }

  return { file: backupFile, size_kb: sizeKb.toFixed(1), remote_key: remoteKey };
}
