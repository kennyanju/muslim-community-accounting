import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { logger } from '@/lib/logger';

export async function POST(request, { params }) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Financial Secretary (Admin) only', 403, { code: 'FORBIDDEN' });
  }

  const { id } = await params;
  
  try {
    const controller = new DatabaseController(user.role, user.id);
    controller.reconcileTransaction(id);
    logger.info('Transaction reconciled & locked', { transactionId: id, userId: user.id });
    return apiSuccess({ id, reconciled: true }, { message: 'Transaction reconciled and locked permanently' });
  } catch (err) {
    logger.warn('Failed to reconcile transaction', { transactionId: id, error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'RECONCILE_ERROR' });
  }
}
