import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { logger } from '@/lib/logger';

export async function POST(request, { params }) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Financial Secretary (Admin) only', 403, { code: 'FORBIDDEN' });
  }

  const { id } = await params;

  try {
    const { reason } = await request.json();
    if (!reason || !reason.trim() || reason.trim().length < 5) {
      return apiError('A detailed void justification (min 5 characters) is mandatory for compliance audit.', 400, { code: 'MISSING_REASON' });
    }

    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const updated = await controller.voidTransaction(id, reason);
    logger.info('Transaction voided in D1', { transactionId: id, reason, userId: user.id });
    return apiSuccess({ id, status: 'VOIDED', reason, transaction: updated }, { message: 'Transaction voided successfully' });
  } catch (error) {
    logger.warn('Void transaction failed', { transactionId: id, error: error.message, userId: user.id });
    return apiError(error.message, 400, { code: 'VOID_ERROR' });
  }
}
