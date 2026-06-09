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

function setCorsHeaders(res: NextResponse, allowOrigin: string): void {
  res.headers.set('Access-Control-Allow-Origin', allowOrigin);
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
  res.headers.set('Access-Control-Max-Age', '7200');
  if (allowOrigin !== '*') {
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Vary', 'Origin');
  }
}

export function cors(res: NextResponse, origin?: string | null): NextResponse {
  const allowOrigin = resolveAllowedOrigin(origin ?? null);
  setCorsHeaders(res, allowOrigin);
  return res;
}

export function corsReflectOrigin(res: NextResponse, origin: string | null): NextResponse {
  const list = getAllowedOrigins();
  if (origin && list.length > 0 && list.includes(origin)) {
    setCorsHeaders(res, origin);
  }
  return res;
}

export function corsOptions(requestOrigin?: string | null): NextResponse {
  return cors(new NextResponse(null, { status: 204 }), requestOrigin);
}
