import { apiSuccess, apiError } from '@/lib/response';
import { logger } from '@/lib/logger';
import { sanitizeText } from '@/lib/sanitize';

export async function POST(request) {
  try {
    const payload = await request.json();
    if (!payload || !payload.message) {
      return apiError('Missing error payload', 400);
    }

    const sanitizedLog = {
      timestamp: payload.timestamp || new Date().toISOString(),
      message: sanitizeText(String(payload.message).substring(0, 500)),
      name: sanitizeText(String(payload.name || 'Error').substring(0, 100)),
      url: sanitizeText(String(payload.url || '').substring(0, 200)),
      user: payload.user ? {
        id: sanitizeText(String(payload.user.id || '')),
        email: sanitizeText(String(payload.user.email || '')),
        role: sanitizeText(String(payload.user.role || ''))
      } : null,
      context: payload.context || {}
    };

    logger.warn(`[Client-Side Error Captured] ${sanitizedLog.name}: ${sanitizedLog.message}`, sanitizedLog);

    return apiSuccess({ received: true });
  } catch (err) {
    return apiError('Failed to process client error report', 500);
  }
}
