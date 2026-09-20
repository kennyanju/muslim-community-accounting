import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateDonorPayload } from '@/lib/validation';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET(request, { params }) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const { id } = await params;

  try {
    const controller = new DatabaseController(user.role, user.id);
    const donor = controller.getDonor(id);

    if (!donor) {
      return apiError('Donor not found', 404, { code: 'NOT_FOUND' });
    }

    return apiSuccess(donor);
  } catch (err) {
    return apiError(err.message, 500, { code: 'SERVER_ERROR' });
  }
}

export async function PUT(request, { params }) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  // RBAC: Only Financial Secretary (ADMIN) can alter donor records
  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Only Administrators can update donor records.', 403, { code: 'FORBIDDEN' });
  }

  const { id } = await params;

  const rateGuard = guardRateLimit(request, 'donor_update', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const body = await request.json();
    validateDonorPayload(body, true);

    const controller = new DatabaseController(user.role, user.id);
    const updated = controller.updateDonor(id, body);

    logger.info('Donor profile updated', { donorId: id, updatedBy: user.id });
    return apiSuccess(updated, { message: 'Donor updated successfully', headers: rateGuard.headers });
  } catch (err) {
    logger.warn('Failed to update donor profile', { donorId: id, error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'UPDATE_ERROR' });
  }
}

export async function DELETE(request, { params }) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Only Administrators can delete donor records.', 403, { code: 'FORBIDDEN' });
  }

  const { id } = await params;

  const rateGuard = guardRateLimit(request, 'donor_delete', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const controller = new DatabaseController(user.role, user.id);
    controller.deleteDonor(id);

    logger.info('Donor record deleted', { donorId: id, deletedBy: user.id });
    return apiSuccess({ deleted: true }, { message: 'Donor deleted successfully', headers: rateGuard.headers });
  } catch (err) {
    logger.warn('Failed to delete donor record', { donorId: id, error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'DELETE_ERROR' });
  }
}
