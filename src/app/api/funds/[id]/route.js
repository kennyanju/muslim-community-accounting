import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateFundPayload } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function PUT(request, { params }) {
  const user = await getAuthenticatedUser(request);
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

    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const updated = await controller.updateFund(id, body);

    logger.info('Fund updated in D1', { fundId: id, changes: body, userId: user.id });
    return apiSuccess(updated, { message: 'Fund updated successfully' });
  } catch (err) {
    logger.warn('Failed to update fund', { fundId: id, error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'VALIDATION_ERROR' });
  }
}
