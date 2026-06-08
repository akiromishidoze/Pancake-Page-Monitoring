import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { createLogger } from './logger';

const log = createLogger('remote-backup');

function getClient(): S3Client | null {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  return new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
  });
}

function getBucket(): string | null {
  return process.env.S3_BUCKET ?? null;
}

function getPrefix(): string {
  return (process.env.S3_PREFIX || 'backups').replace(/\/+$/, '') + '/';
}

function getRetention(): number {
  const n = parseInt(process.env.S3_MAX_BACKUPS ?? '30', 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export async function uploadToS3(filePath: string): Promise<string | null> {
  const client = getClient();
  const bucket = getBucket();
  if (!client || !bucket) {
    log.info('S3 not configured (S3_BUCKET not set) — skipping remote upload');
    return null;
  }

  const fileName = path.basename(filePath);
  const key = getPrefix() + fileName;
  const fileSize = await stat(filePath).then(s => s.size);

  log.info({ bucket, key, size: fileSize }, 'uploading backup to S3');

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(filePath),
    ContentType: 'application/octet-stream',
  }));

  log.info({ bucket, key }, 'S3 upload complete');
  return key;
}

export async function listRemoteBackups(): Promise<{ key: string; size: number; lastModified: Date }[]> {
  const client = getClient();
  const bucket = getBucket();
  if (!client || !bucket) return [];

  const prefix = getPrefix();
  const result = await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  }));

  return (result.Contents ?? [])
    .filter(obj => obj.Key && !obj.Key.endsWith('/'))
    .map(obj => ({
      key: obj.Key!,
      size: obj.Size ?? 0,
      lastModified: obj.LastModified ?? new Date(0),
    }))
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

export async function cleanupRemoteBackups(): Promise<number> {
  const client = getClient();
  const bucket = getBucket();
  if (!client || !bucket) return 0;

  const all = await listRemoteBackups();
  const maxKeep = getRetention();
  if (all.length <= maxKeep) return 0;

  const toDelete = all.slice(maxKeep);
  for (const obj of toDelete) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.key }));
    log.info({ key: obj.key }, 'deleted old remote backup');
  }

  return toDelete.length;
}
