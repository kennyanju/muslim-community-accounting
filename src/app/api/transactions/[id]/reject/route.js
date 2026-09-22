import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { logger } from '@/lib/logger';

export async function POST(request, { params }) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  // Dual approvals/rejections can be performed by ADMIN or REVIEWER (trustee review)
  const roleCheck = requireRole(user, ['ADMIN', 'REVIEWER']);
  if (!roleCheck.ok) {
    return apiError(roleCheck.message, roleCheck.status, { code: 'FORBIDDEN' });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const reason = body?.reason;
    if (!reason || !reason.trim() || reason.trim().length < 5) {
      return apiError('A detailed rejection reason (minimum 5 characters) is required.', 400, { code: 'INVALID_REASON' });
    }

    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const updated = await controller.rejectTransaction(id, reason);
    logger.info('Transaction rejected under dual-authorization policy', { transactionId: id, rejecterId: user.id, reason });
    return apiSuccess({ id, status: 'FAILED', approval_status: 'REJECTED', reason, transaction: updated }, { message: 'Transaction rejected successfully' });
  } catch (error) {
    logger.warn('Reject transaction failed', { transactionId: id, error: error.message, userId: user.id });
    const isForbidden = error.message.includes('Self-approval') || error.message.includes('Forbidden');
    return apiError(error.message, isForbidden ? 403 : 400, { code: isForbidden ? 'FORBIDDEN' : 'REJECT_ERROR' });
  }
}
