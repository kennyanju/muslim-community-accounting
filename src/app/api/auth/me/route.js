import { getAuthenticatedUser, createSessionToken, buildSessionCookie } from '@/lib/auth';
import { getOrganisationFromRequest } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/response';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const organisation = getOrganisationFromRequest(request);

  // Sliding session auto-refresh: reissue fresh session token to maintain active persistence without abrupt logout
  const token = createSessionToken(user);
  const cookieHeader = buildSessionCookie(token);

  const response = apiSuccess({
    user,
    organisation
  });

  response.headers.set('Set-Cookie', cookieHeader);
  return response;
}
