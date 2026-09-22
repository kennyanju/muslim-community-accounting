import { D1Controller, DISPLAY_SAFE_ORG_FIELDS } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { logger } from '@/lib/logger';

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Period lock governance requires Admin privileges', 403, { code: 'FORBIDDEN' });
  }

  try {
    const body = await request.json();
    const { action, closed_until_date, reason } = body || {};

    const controller = new D1Controller(user.role, user.id, user.name, user.email);

    let updated;
    if (action === 'close') {
      updated = await controller.closeAccountingPeriod(closed_until_date, reason);
      logger.info('Accounting period closed & locked', { closed_until_date, userId: user.id });
    } else if (action === 'reopen') {
      updated = await controller.reopenAccountingPeriod(reason);
      logger.info('Accounting period reopened', { userId: user.id });
    } else {
      return apiError("Invalid action. Must be 'close' or 'reopen'.", 400, { code: 'INVALID_ACTION' });
    }

    const response = apiSuccess(updated, { message: action === 'close' ? 'Accounting period closed and locked' : 'Accounting period reopened' });

    // Update display-safe cookie
    const displaySafeOrg = {};
    DISPLAY_SAFE_ORG_FIELDS.forEach(field => {
      if (updated[field] !== undefined) {
        displaySafeOrg[field] = updated[field];
      }
    });

    response.cookies.set('masjid_org_pref', encodeURIComponent(JSON.stringify(displaySafeOrg)), {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
      httpOnly: false
    });

    return response;
  } catch (err) {
    logger.warn('Failed to update period lock status', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'PERIOD_LOCK_ERROR' });
  }
}
