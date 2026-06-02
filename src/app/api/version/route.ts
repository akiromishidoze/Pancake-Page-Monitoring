import { NextResponse } from 'next/server';
import { cors, corsOptions } from '@/lib/cors';

const pkg = { version: '0.1.0' };

export async function OPTIONS() {
  return corsOptions();
}

export async function GET() {
  return cors(NextResponse.json({
    ok: true,
    name: 'dashboard',
    version: pkg.version,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime(),
  }));
}
