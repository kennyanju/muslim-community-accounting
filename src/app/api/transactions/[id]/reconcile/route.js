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
  const body = await request.json().catch(() => ({}));
  const bankStatementRef = body.bankStatementRef || body.bank_statement_ref || '';

  try {
    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const updated = await controller.reconcileTransaction(id, { bankStatementRef });
    logger.info('Transaction reconciled & locked with bank audit ref', { transactionId: id, bankStatementRef, userId: user.id });
    return apiSuccess({ id, reconciled: true, transaction: updated }, { message: 'Transaction reconciled and locked permanently' });
  } catch (err) {
    logger.warn('Failed to reconcile transaction', { transactionId: id, error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'RECONCILE_ERROR' });
  }
}
