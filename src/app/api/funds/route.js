import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateFundPayload } from '@/lib/validation';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const controller = new DatabaseController(user.role, user.id);
  const funds = controller.getFunds();
  return apiSuccess(funds, {
    headers: { 'Cache-Control': 'private, no-cache' }
  });
}

export async function POST(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  // Rate limit fund creation
  const rateGuard = guardRateLimit(request, 'create_fund', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const body = await request.json();
    validateFundPayload(body, false);

    const { name, is_restricted, description } = body;
    const controller = new DatabaseController(user.role, user.id);
    const newFund = controller.createFund({ name, is_restricted, description });

    logger.info('Fund created', { fundId: newFund.id, name: newFund.name, userId: user.id });
    return apiSuccess(newFund, { status: 201, message: 'Fund created successfully', headers: rateGuard.headers });
  } catch (err) {
    logger.warn('Failed to create fund', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'VALIDATION_ERROR' });
  }
}
