import { NextResponse } from 'next/server';
import { cors, corsOptions } from '@/lib/cors';
import { getPollerStatus } from '@/lib/poller';
import { readPool } from '@/lib/db';
import { readFileSync } from 'fs';
import { join } from 'path';

let _pkgVersion: string | null = null;

function getVersion(): string {
  if (_pkgVersion) return _pkgVersion;
  try {
    _pkgVersion = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version || '0.0.0';
  } catch {
    _pkgVersion = '0.0.0';
  }
  return _pkgVersion!;
}

export async function OPTIONS() {
  return corsOptions();
}

export async function GET() {
  let dbOk = false;
  try {
    await readPool.query('SELECT 1');
    dbOk = true;
  } catch {
    // DB unavailable
  }

  const poller = getPollerStatus();

  return cors(NextResponse.json({
    ok: true,
    name: 'dashboard',
    version: getVersion(),
    sourceVersion: process.env.SOURCE_VERSION || null,
    buildTime: process.env.BUILD_TIME || null,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    db: dbOk ? 'connected' : 'disconnected',
    poller,
  }));
}
