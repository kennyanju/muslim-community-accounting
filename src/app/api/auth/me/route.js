import { getAuthenticatedUser, createSessionToken, buildSessionCookie } from '@/lib/auth';
import { D1Controller } from '@/lib/d1-controller';
import { apiSuccess, apiError } from '@/lib/response';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const controller = new D1Controller(user.role, user.id, user.name, user.email);
  const organisation = await controller.getOrganisation();

  // Sliding session auto-refresh: reissue fresh session token to maintain active persistence without abrupt logout
  const token = createSessionToken(user, user.jti);
  const cookieHeader = buildSessionCookie(token);

  const response = apiSuccess({
    user,
    organisation
  });

  response.headers.set('Set-Cookie', cookieHeader);
  return response;
}

