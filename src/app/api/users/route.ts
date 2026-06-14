import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch, requireJson } from '@/lib/errors';
import { withAuth } from '@/lib/auth';
import { listUsers, createUser, logAuditEntry } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { UserCreateSchema } from '@/lib/schemas';
import { getClientIp } from '@/lib/rate-limit';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const GET = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
  try {
    const users = await listUsers();
    const safe = users.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      is_active: u.is_active,
      created_at: u.created_at,
    }));
    return NextResponse.json({ ok: true, users: safe });
  } catch (e) {
    return apiCatch(e);
  }
});

export const POST = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
  try {
    const ctErr = requireJson(req);
    if (ctErr) return ctErr;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = UserCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const { email, username, password, role } = parsed.data;

    const { getUserByEmail } = await import('@/lib/db');
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Email already exists', 409);
    }

    const pwHash = await hashPassword(password);
    const user = await createUser(email, username, pwHash, role);

    const ip = getClientIp(req);
    void logAuditEntry('create_user', 'user', String(user.id), `Created user "${email}" with role "${role}"`, ip);

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, username: user.username, role: user.role, is_active: user.is_active },
    });
  } catch (e) {
    return apiCatch(e);
  }
});
