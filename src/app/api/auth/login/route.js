import { D1Controller } from '@/lib/d1-controller';
import { verifyPassword, createSessionToken, buildSessionCookie, getSafeUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';
import crypto from 'crypto';

export async function POST(request) {
  const rateGuard = await guardRateLimit(request, 'login', config.rateLimit.loginMaxAttempts, config.rateLimit.loginWindowMs);

  if (!rateGuard.isAllowed) {
    logger.warn('Rate limit exceeded on login attempt', { resetTime: rateGuard.rate.resetTime });
    return rateGuard.errorResponse;
  }

  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return apiError('Email and password are required', 400, { code: 'INVALID_CREDENTIALS', headers: rateGuard.headers });
    }

    const controller = new D1Controller('REVIEWER');
    const user = await controller.getUserByEmail(email);

    if (!user || user.status !== 'ACTIVE') {
      logger.warn('Failed login attempt: inactive user or user not found', { email });
      return apiError('Account is inactive or credentials are invalid', 401, { code: 'UNAUTHORIZED', headers: rateGuard.headers });
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      logger.warn('Failed login attempt: incorrect password', { email });
      return apiError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS', headers: rateGuard.headers });
    }

    // Generate unique JTI nonce and register session in D1 (Item #10)
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + (config.session.maxAge || 604800) * 1000).toISOString();
    await controller.createSession(user.id, jti, expiresAt);

    const token = createSessionToken(user, jti);
    const cookieHeader = buildSessionCookie(token);
    const safeUser = getSafeUser(user);
    const org = await controller.getOrganisation();

    logger.info('User logged in successfully with D1 session', { userId: user.id, role: user.role, jti });

    const response = apiSuccess({
      user: safeUser,
      organisation: org
    }, {
      message: 'Authentication successful',
      headers: rateGuard.headers
    });

    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch (err) {
    logger.error('Login error', { error: err.message, stack: err.stack });
    return apiError('Authentication failed', 500, { code: 'INTERNAL_ERROR' });
  }
}
