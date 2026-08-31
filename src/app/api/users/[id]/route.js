import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateUserPayload } from '@/lib/validation';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function PUT(request, { params }) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const { id } = await params;

  // IDOR & Authorization Defense: Only ADMIN can modify arbitrary users. Non-admins can only modify their own profile.
  const isSelf = user.id === id;
  const isAdmin = user.role === 'ADMIN';

  if (!isAdmin && !isSelf) {
    return apiError('Forbidden: Cannot modify other user accounts (IDOR protection)', 403, { code: 'FORBIDDEN' });
  }

  // Rate limit user profile modifications
  const rateGuard = guardRateLimit(request, 'user_update', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const body = await request.json();
    validateUserPayload(body, true);

    // Whitelist only permitted fields for updating user records
    const sanitizedUpdate = {};
    if (body.name !== undefined) sanitizedUpdate.name = String(body.name).trim();
    if (body.password !== undefined && body.password.trim()) sanitizedUpdate.password = body.password.trim();

    // Only administrators can modify roles or account status (Privilege Escalation Defense)
    if (isAdmin) {
      if (body.role !== undefined) sanitizedUpdate.role = body.role;
      if (body.status !== undefined) sanitizedUpdate.status = body.status;
    }

    const controller = new DatabaseController(user.role, user.id);
    const updated = controller.updateUser(id, sanitizedUpdate);

    logger.info('User updated', { targetUserId: id, modifiedBy: user.id });
    return apiSuccess(updated, { message: 'User updated successfully', headers: rateGuard.headers });
  } catch (err) {
    logger.warn('Failed to update user', { targetUserId: id, error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'UPDATE_ERROR' });
  }
}
