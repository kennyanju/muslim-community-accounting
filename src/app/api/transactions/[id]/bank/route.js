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
    controller.depositCash(id);
    logger.info('Cash deposited to bank', { transactionId: id, userId: user.id });
    return apiSuccess({ id, status: 'BANKED' }, { message: 'Cash deposit confirmed and banked' });
  } catch (err) {
    logger.warn('Failed to bank cash deposit', { transactionId: id, error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'BANKING_ERROR' });
  }
}
