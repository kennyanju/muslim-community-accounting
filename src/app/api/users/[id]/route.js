import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateUserPayload } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function PUT(request, { params }) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    validateUserPayload(body, true);

    const controller = new DatabaseController(user.role, user.id);
    const updated = controller.updateUser(id, body);

    logger.info('User updated', { targetUserId: id, modifiedBy: user.id });
    return apiSuccess(updated, { message: 'User updated successfully' });
  } catch (err) {
    logger.warn('Failed to update user', { targetUserId: id, error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'UPDATE_ERROR' });
  }
}
