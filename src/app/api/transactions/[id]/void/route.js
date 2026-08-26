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
    const { reason } = await request.json();
    if (!reason || !reason.trim()) {
      return apiError('Void reason is mandatory for audit compliance', 400, { code: 'MISSING_REASON' });
    }

    const controller = new DatabaseController(user.role, user.id);
    controller.voidTransaction(id, reason);
    logger.info('Transaction voided', { transactionId: id, reason, userId: user.id });
    return apiSuccess({ id, status: 'VOIDED', reason }, { message: 'Transaction voided successfully' });
  } catch (error) {
    logger.warn('Void transaction failed', { transactionId: id, error: error.message, userId: user.id });
    return apiError(error.message, 400, { code: 'VOID_ERROR' });
  }
}
