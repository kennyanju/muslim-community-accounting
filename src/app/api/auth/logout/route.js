import { buildLogoutCookie, revokeSession, verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { apiSuccess } from '@/lib/response';

export async function POST(request) {
  // Extract token from request to revoke JTI in D1 (Item #10)
  try {
    let token = null;
    if (request?.cookies && typeof request.cookies.get === 'function') {
      token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    } else if (request?.headers && typeof request.headers.get === 'function') {
      const cookieHeader = request.headers.get('cookie') || '';
      const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`));
      if (match) token = match.split('=')[1];
    }

    if (token) {
      const payload = verifySessionToken(token);
      if (payload?.jti) {
        await revokeSession(payload.jti);
      }
    }
  } catch (_) {}

  const cookieHeader = buildLogoutCookie();
  const response = apiSuccess({ message: 'Logged out successfully' });
  response.headers.set('Set-Cookie', cookieHeader);
  return response;
}
