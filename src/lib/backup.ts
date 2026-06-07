import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

export async function backup(): Promise<string> {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUPS_DIR, `monitor_${timestamp}.dump`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  await new Promise<void>((resolve, reject) => {
    const dump = spawn('pg_dump', [
      '--clean', '--if-exists',
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

  const files = (await fs.readdir(BACKUPS_DIR))
    .filter(f => f.startsWith('monitor_') && f.endsWith('.dump'))
    .sort()
    .reverse();
  for (const old of files.slice(30)) {
    await fs.unlink(path.join(BACKUPS_DIR, old));
  }

  return backupFile;
}
