import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch, requireJson } from '@/lib/errors';
import { withAuth } from '@/lib/auth';
import { getUserById, updateUserEmail, updateUserRole, setUserActive, deleteUser, updateUserPassword, getAdminCount, logAuditEntry } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { UserUpdateSchema } from '@/lib/schemas';
import { getClientIp } from '@/lib/rate-limit';

export const PUT = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Invalid user ID', 400);
    }

    const existing = await getUserById(userId);
    if (!existing) {
      return apiError(ErrorCodes.NOT_FOUND, 'User not found', 404);
    }

    const ctErr = requireJson(req);
    if (ctErr) return ctErr;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = UserUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const ip = getClientIp(req);
    const changes: string[] = [];

    if (parsed.data.email !== undefined && parsed.data.email !== existing.email) {
      await updateUserEmail(userId, parsed.data.email);
      changes.push(`email: ${existing.email} → ${parsed.data.email}`);
    }

    if (parsed.data.role !== undefined && parsed.data.role !== existing.role) {
      const adminCount = await getAdminCount();
      if (existing.role === 'admin' && parsed.data.role !== 'admin' && adminCount <= 1) {
        return apiError(ErrorCodes.FORBIDDEN, 'Cannot remove the last admin', 403);
      }
      await updateUserRole(userId, parsed.data.role);
      changes.push(`role: ${existing.role} → ${parsed.data.role}`);
    }

    if (parsed.data.is_active !== undefined && parsed.data.is_active !== existing.is_active) {
      const adminCount = await getAdminCount();
      if (existing.role === 'admin' && !parsed.data.is_active && adminCount <= 1) {
        return apiError(ErrorCodes.FORBIDDEN, 'Cannot deactivate the last admin', 403);
      }
      await setUserActive(userId, parsed.data.is_active);
      changes.push(`is_active: ${existing.is_active} → ${parsed.data.is_active}`);
    }

    if (parsed.data.password !== undefined) {
      const hashed = await hashPassword(parsed.data.password);
      await updateUserPassword(userId, hashed);
      changes.push('password changed');
    }

    if (changes.length > 0) {
      void logAuditEntry('update_user', 'user', String(userId), `Updated: ${changes.join(', ')}`, ip);
    }

    const updated = await getUserById(userId);
    return NextResponse.json({
      ok: true,
      user: {
        id: updated!.id,
        email: updated!.email,
        username: updated!.username,
        role: updated!.role,
        is_active: updated!.is_active,
      },
    });
  } catch (e) {
    return apiCatch(e);
  }
});

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Invalid user ID', 400);
    }

    const existing = await getUserById(userId);
    if (!existing) {
      return apiError(ErrorCodes.NOT_FOUND, 'User not found', 404);
    }

    if (existing.role === 'admin') {
      const adminCount = await getAdminCount();
      if (adminCount <= 1) {
        return apiError(ErrorCodes.FORBIDDEN, 'Cannot delete the last admin', 403);
      }
    }

    const deleted = await deleteUser(userId);
    if (!deleted) {
      return apiError(ErrorCodes.NOT_FOUND, 'User not found', 404);
    }

    const ip = getClientIp(req);
    void logAuditEntry('delete_user', 'user', String(userId), `Deleted user "${existing.email}"`, ip);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiCatch(e);
  }
});
