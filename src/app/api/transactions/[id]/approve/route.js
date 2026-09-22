import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { logger } from '@/lib/logger';

export async function POST(request, { params }) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  // Dual approvals can be performed by ADMIN or REVIEWER (trustee review)
  const roleCheck = requireRole(user, ['ADMIN', 'REVIEWER']);
  if (!roleCheck.ok) {
    return apiError(roleCheck.message, roleCheck.status, { code: 'FORBIDDEN' });
  }

  const { id } = await params;

  try {
    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const updated = await controller.approveTransaction(id);
    logger.info('Transaction approved under dual-authorization policy', { transactionId: id, approverId: user.id });
    return apiSuccess({ id, status: updated.status, approval_status: 'APPROVED', transaction: updated }, { message: 'Transaction approved successfully' });
  } catch (error) {
    logger.warn('Approve transaction failed', { transactionId: id, error: error.message, userId: user.id });
    const isForbidden = error.message.includes('Self-approval') || error.message.includes('Forbidden');
    return apiError(error.message, isForbidden ? 403 : 400, { code: isForbidden ? 'FORBIDDEN' : 'APPROVE_ERROR' });
  }
}
