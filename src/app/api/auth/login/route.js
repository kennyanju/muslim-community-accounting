import { NextResponse } from 'next/server';
import { readDB, getOrganisationFromRequest } from '@/lib/db';
import { verifyPassword, createSessionToken, buildSessionCookie } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';

export async function POST(request) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`login:${ip}`, config.rateLimit.loginMaxAttempts, config.rateLimit.loginWindowMs);

  if (!rate.isAllowed) {
    logger.warn('Rate limit exceeded on login attempt', { ip, resetTime: rate.resetTime });
    return apiError('Too many login attempts. Please try again later.', 429, {
      code: 'RATE_LIMIT_EXCEEDED',
      details: { retryAfterSeconds: rate.resetTime }
    });
  }

  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return apiError('Email and password are required', 400, { code: 'INVALID_CREDENTIALS' });
    }

    const db = readDB();
    const user = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());

    if (!user || user.status !== 'ACTIVE') {
      logger.warn('Failed login attempt: inactive user or user not found', { email, ip });
      return apiError('Account is inactive or credentials are invalid', 401, { code: 'UNAUTHORIZED' });
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      logger.warn('Failed login attempt: incorrect password', { email, ip });
      return apiError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });
    }

    const token = createSessionToken(user);
    const cookieHeader = buildSessionCookie(token);

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name || user.email.split('@')[0],
      role: user.role
    };

    const org = getOrganisationFromRequest(request);

    logger.info('User logged in successfully', { userId: user.id, role: user.role });

    const response = apiSuccess({
      user: safeUser,
      organisation: org
    }, { message: 'Authentication successful' });

    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch (err) {
    logger.error('Login error', { error: err.message, stack: err.stack });
    return apiError('Authentication failed', 500, { code: 'INTERNAL_ERROR' });
  }
}
