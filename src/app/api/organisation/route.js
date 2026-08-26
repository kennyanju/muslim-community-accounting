import { DatabaseController, getOrganisationFromRequest } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const org = getOrganisationFromRequest(request);
  return apiSuccess(org);
}

export async function PUT(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  try {
    const body = await request.json();
    const controller = new DatabaseController(user.role, user.id);
    const updated = controller.updateOrganisation(body);

    logger.info('Organisation profile updated', { name: updated.name, userId: user.id });

    const response = apiSuccess(updated, { message: 'Organisation settings saved' });
    
    // Set 1-year persistent cookie so organisation settings survive edge cold-starts and logouts
    const cookieVal = encodeURIComponent(JSON.stringify(updated));
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
