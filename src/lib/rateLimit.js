/**
 * In-Memory Sliding Window Rate Limiter
 */

const hitStore = new Map();

/**
 * Check and record a rate limit hit for an identifier (e.g. IP or user ID)
 * @param {string} key - Unique client identifier
 * @param {number} maxRequests - Max permitted requests in the window
 * @param {number} windowMs - Window duration in milliseconds
 * @returns {{ isAllowed: boolean, remaining: number, resetTime: number }}
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
    remaining: maxRequests - timestamps.length,
    resetTime: Math.ceil(windowMs / 1000)
  };
}

/**
 * Extract client IP from Next.js request headers
 */
export function getClientIp(request) {
  if (!request || !request.headers) return '127.0.0.1';
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    '127.0.0.1'
  );
}
