import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const authCheck = requireRole(user, ['ADMIN', 'AUDITOR']);
  if (!authCheck.ok) {
    return apiError(authCheck.message, authCheck.status, { code: 'FORBIDDEN' });
  }

  const controller = new D1Controller(user.role, user.id, user.name, user.email);
  const claims = await controller.getGiftAidClaims();
  return apiSuccess(claims, { message: 'Gift Aid claim batches retrieved successfully' });
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const authCheck = requireRole(user, ['ADMIN', 'AUDITOR']);
  if (!authCheck.ok) {
    return apiError(authCheck.message, authCheck.status, { code: 'FORBIDDEN' });
  }

  const rateGuard = await guardRateLimit(request, 'giftaid_claim_create', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const body = await request.json();
    const { period_start, period_end, notes } = body;
    if (!period_start || !period_end) {
      return apiError('Both period_start and period_end dates are required.', 400, { code: 'MISSING_DATE_RANGE' });
    }

    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const claim = await controller.createGiftAidClaimBatch({
      period_start,
      period_end,
      notes: notes || ''
    });

    logger.info('HMRC Gift Aid claim batch created and locked', {
      claimRef: claim.claim_reference,
      txCount: claim.transaction_count,
      totalClaim: claim.total_claim,
      userId: user.id
    });

    return apiSuccess(claim, { status: 201, message: 'Gift Aid claim batch created and locked successfully' });
  } catch (err) {
    logger.warn('Failed to create Gift Aid claim batch', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'CLAIM_CREATION_ERROR' });
  }
}
