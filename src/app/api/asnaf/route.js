import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');

  try {
    const controller = new DatabaseController(user.role, user.id);
    const records = controller.getAsnafRecords(year);
    return apiSuccess(records);
  } catch (err) {
    return apiError(err.message, 500, { code: 'ASNAF_ERROR' });
  }
}

export async function POST(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Only Administrators can record Asnaf distributions.', 403, { code: 'FORBIDDEN' });
  }

  const rateGuard = guardRateLimit(request, 'asnaf_record', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const body = await request.json();
    const controller = new DatabaseController(user.role, user.id);
    const record = controller.recordAsnafDisbursement(body);

    logger.info('Asnaf distribution recorded', { asnafId: record.id, category: record.asnaf_category, amount: record.amount, userId: user.id });
    return apiSuccess(record, { message: 'Asnaf distribution recorded successfully', headers: rateGuard.headers });
  } catch (err) {
    return apiError(err.message, 400, { code: 'RECORD_ERROR' });
  }
}
