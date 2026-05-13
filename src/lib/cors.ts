import { NextResponse } from 'next/server';

export function cors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
  return res;
}

export function corsOptions(): NextResponse {
  return cors(new NextResponse(null, { status: 204 }));
}
