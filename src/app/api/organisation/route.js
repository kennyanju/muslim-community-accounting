import { D1Controller, DISPLAY_SAFE_ORG_FIELDS } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateOrganisationPayload } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function GET(request) {
  try {
    const controller = new D1Controller('REVIEWER');
    const org = await controller.getOrganisation();
    return apiSuccess(org);
  } catch (err) {
    return apiError(err.message, 500);
  }
}

export async function PUT(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  try {
    const body = await request.json();
    validateOrganisationPayload(body);

    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const updated = await controller.updateOrganisation(body);

    logger.info('Organisation profile updated in D1', { name: updated.name, userId: user.id });

    const response = apiSuccess(updated, { message: 'Organisation settings saved' });

    // Set 1-year persistent cookie containing only display-safe fields to protect internal contact/charity metadata
    const displaySafeOrg = {};
    DISPLAY_SAFE_ORG_FIELDS.forEach(field => {
      if (updated[field] !== undefined) {
        displaySafeOrg[field] = updated[field];
      }
    });

    const cookieVal = encodeURIComponent(JSON.stringify(displaySafeOrg));
    response.cookies.set('masjid_org_pref', cookieVal, {
      path: '/',
      maxAge: 31536000, // 1 year in seconds
      sameSite: 'lax',
      httpOnly: false
    });

    return response;
  } catch (err) {
    logger.warn('Failed to update organisation profile', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'UPDATE_ERROR' });
  }
}
