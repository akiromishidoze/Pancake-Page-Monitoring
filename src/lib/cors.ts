import { NextResponse } from 'next/server';

let allowedOrigins: string[] | null = null;

function getAllowedOrigins(): string[] {
  if (allowedOrigins === null) {
    const raw = process.env.ALLOWED_ORIGINS || '';
    allowedOrigins = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return allowedOrigins;
}

function resolveAllowedOrigin(requestOrigin: string | null): string {
  const list = getAllowedOrigins();
  if (list.length === 0) return '*';
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return list[0];
}

export function cors(res: NextResponse, origin?: string | null): NextResponse {
  const allowOrigin = resolveAllowedOrigin(origin ?? null);
  res.headers.set('Access-Control-Allow-Origin', allowOrigin);
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
  if (allowOrigin !== '*') {
    res.headers.set('Vary', 'Origin');
  }
  return res;
}

export function corsReflectOrigin(res: NextResponse, origin: string | null): NextResponse {
  if (origin) {
    const list = getAllowedOrigins();
    const allowed = list.length === 0 || list.includes(origin);
    const allowOrigin = allowed ? origin : (list.length > 0 ? list[0] : '*');
    res.headers.set('Access-Control-Allow-Origin', allowOrigin);
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
    if (allowOrigin !== '*') {
      res.headers.set('Vary', 'Origin');
    }
  }
  return res;
}

export function corsOptions(requestOrigin?: string | null): NextResponse {
  return cors(new NextResponse(null, { status: 204 }), requestOrigin);
}
