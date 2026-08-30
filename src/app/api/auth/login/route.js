import { NextResponse } from 'next/server';
import { readDB, getOrganisationFromRequest } from '@/lib/db';
import { verifyPassword, createSessionToken, buildSessionCookie, getSafeUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';

export async function POST(request) {
  const rateGuard = guardRateLimit(request, 'login', config.rateLimit.loginMaxAttempts, config.rateLimit.loginWindowMs);

  if (!rateGuard.isAllowed) {
    logger.warn('Rate limit exceeded on login attempt', { resetTime: rateGuard.rate.resetTime });
    return rateGuard.errorResponse;
  }

  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return apiError('Email and password are required', 400, { code: 'INVALID_CREDENTIALS', headers: rateGuard.headers });
    }

    const db = readDB();
    const user = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());

    if (!user || user.status !== 'ACTIVE') {
      logger.warn('Failed login attempt: inactive user or user not found', { email });
      return apiError('Account is inactive or credentials are invalid', 401, { code: 'UNAUTHORIZED', headers: rateGuard.headers });
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      logger.warn('Failed login attempt: incorrect password', { email });
      return apiError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS', headers: rateGuard.headers });
    }

    const token = createSessionToken(user);
    const cookieHeader = buildSessionCookie(token);
    const safeUser = getSafeUser(user);
    const org = getOrganisationFromRequest(request);

    logger.info('User logged in successfully', { userId: user.id, role: user.role });

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
