/**
 * Sliding Window Rate Limiter
 * Provides rate limit verification and standard IETF RateLimit response headers
 */

import { apiError } from './response.js';

const hitStore = new Map();

/**
 * Check and record a rate limit hit for an identifier (e.g. IP or user ID)
 * @param {string} key - Unique client identifier
 * @param {number} maxRequests - Max permitted requests in the window
 * @param {number} windowMs - Window duration in milliseconds
 * @returns {{ isAllowed: boolean, remaining: number, resetTime: number, limit: number }}
 */
export function checkRateLimit(key, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = hitStore.get(key) || [];
  
  // Filter out timestamps outside the active window
  timestamps = timestamps.filter(ts => ts > windowStart);

  if (timestamps.length >= maxRequests) {
    const oldestTimestamp = timestamps[0];
    const resetTime = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
    return {
      isAllowed: false,
      limit: maxRequests,
      remaining: 0,
      resetTime: Math.max(resetTime, 1)
    };
  }

  timestamps.push(now);
  hitStore.set(key, timestamps);

  // Periodic cleanup if store grows large
  if (hitStore.size > 5000) {
    for (const [k, tsList] of hitStore.entries()) {
      const active = tsList.filter(ts => ts > windowStart);
      if (active.length === 0) {
        hitStore.delete(k);
      } else {
        hitStore.set(k, active);
      }
    }
  }

  return {
    isAllowed: true,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - timestamps.length),
    resetTime: Math.ceil(windowMs / 1000)
  };
}

/**
 * Extract client IP from Next.js request headers
 */
export function getClientIp(request) {
  if (!request || !request.headers) return '127.0.0.1';
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

/**
 * Standard RateLimit response headers builder
 */
export function getRateLimitHeaders(rate) {
  return {
    'RateLimit-Limit': String(rate.limit || 60),
    'RateLimit-Remaining': String(rate.remaining ?? 0),
    'RateLimit-Reset': String(rate.resetTime || 60),
    'Retry-After': String(rate.resetTime || 60)
  };
}

/**
 * Helper to apply rate limiting and return error response if exceeded
 * @param {Request} request
 * @param {string} prefix
 * @param {number} maxRequests
 * @param {number} windowMs
 * @param {string} [userId]
 * @returns {{ isAllowed: boolean, rate: object, headers: object, errorResponse: Response|null }}
 */
export function guardRateLimit(request, prefix, maxRequests = 60, windowMs = 60000, userId = null) {
  const ip = getClientIp(request);
  const key = userId ? `${prefix}:${userId}:${ip}` : `${prefix}:${ip}`;
  const rate = checkRateLimit(key, maxRequests, windowMs);
  const headers = getRateLimitHeaders(rate);

  if (!rate.isAllowed) {
    const errorResponse = apiError('Too many requests. Please slow down and try again.', 429, {
      code: 'RATE_LIMIT_EXCEEDED',
      details: { retryAfterSeconds: rate.resetTime },
      headers
    });
    return { isAllowed: false, rate, headers, errorResponse };
  }

  return { isAllowed: true, rate, headers, errorResponse: null };
}
