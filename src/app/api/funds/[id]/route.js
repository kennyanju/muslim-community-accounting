import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateFundPayload } from '@/lib/validation';
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
    validateFundPayload(body, true);

    const controller = new DatabaseController(user.role, user.id);
    const updated = controller.updateFund(id, body);

    logger.info('Fund updated', { fundId: id, changes: body, userId: user.id });
    return apiSuccess(updated, { message: 'Fund updated successfully' });
  } catch (err) {
    logger.warn('Failed to update fund', { fundId: id, error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'VALIDATION_ERROR' });
  }
}
