import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Only Administrators can transfer funds.', 403, { code: 'FORBIDDEN' });
  }

  const rateGuard = await guardRateLimit(request, 'fund_transfer', config.rateLimit.writeMaxAttempts || 30, config.rateLimit.writeWindowMs || 60000, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const body = await request.json();
    const { fromFundId, toFundId, from_fund_id, to_fund_id, amount, reason, date } = body;

    const sourceId = fromFundId || from_fund_id;
    const targetId = toFundId || to_fund_id;

    if (!sourceId || !targetId) {
      return apiError('Source and destination fund IDs are required.', 400, { code: 'INVALID_PAYLOAD' });
    }

    if (!amount || parseFloat(amount) <= 0) {
      return apiError('Transfer amount must be greater than zero.', 400, { code: 'INVALID_AMOUNT' });
    }

    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const result = await controller.transferFund({
      fromFundId: sourceId,
      toFundId: targetId,
      amount,
      reason,
      date
    });

    logger.info('Inter-fund transfer completed', {
      sourceId,
      targetId,
      amount,
      userId: user.id
    });

    return apiSuccess(result, {
      message: 'Fund transfer executed successfully',
      headers: rateGuard.headers
    });
  } catch (err) {
    logger.error('Failed to execute fund transfer', { error: err.message });
    return apiError(err.message, 400, { code: 'TRANSFER_ERROR' });
  }
}
