import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateFundPayload } from '@/lib/validation';
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

  try {
    const body = await request.json();
    validateFundPayload(body, false);

    const { name, is_restricted, description } = body;
    const controller = new DatabaseController(user.role, user.id);
    const newFund = controller.createFund({ name, is_restricted, description });

    logger.info('Fund created', { fundId: newFund.id, name: newFund.name, userId: user.id });
    return apiSuccess(newFund, { status: 201, message: 'Fund created successfully' });
  } catch (err) {
    logger.warn('Failed to create fund', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'VALIDATION_ERROR' });
  }
}
