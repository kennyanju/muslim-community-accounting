import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year') || searchParams.get('fiscal_year');
  const txId = searchParams.get('transaction_id');

  try {
    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const records = await controller.getAsnafRecords(txId || year);
    return apiSuccess(records);
  } catch (err) {
    return apiError(err.message, 500, { code: 'ASNAF_ERROR' });
  }
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Only Administrators can record Asnaf distributions.', 403, { code: 'FORBIDDEN' });
  }

  const rateGuard = await guardRateLimit(request, 'asnaf_record', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const body = await request.json();
    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const record = await controller.recordAsnafDisbursement(body);

    logger.info('Asnaf distribution recorded in D1', { asnafId: record.id, category: record.asnaf_category, amount: record.amount, userId: user.id });
    return apiSuccess(record, { message: 'Asnaf distribution recorded successfully', headers: rateGuard.headers });
  } catch (err) {
    return apiError(err.message, 400, { code: 'RECORD_ERROR' });
  }
}
