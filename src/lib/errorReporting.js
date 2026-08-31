/**
 * Robust Client-Side Error Reporting, Sentry/Highlight Integration & Breadcrumbs Collector
 */

const breadcrumbs = [];
const MAX_BREADCRUMBS = 30;

let userContext = null;
let mosqueContext = null;

/**
 * Attach authenticated user context to all future error reports
 * @param {Object} user
 */
export function setUserContext(user) {
  if (!user) {
    userContext = null;
    return;
  }
  userContext = {
    id: user.id || 'anonymous',
    email: user.email || 'unknown',
    role: user.role || 'GUEST'
  };
}

/**
 * Clear user context on logout
 */
export function clearUserContext() {
  userContext = null;
}

/**
 * Attach active mosque organisation context
 * @param {Object} org
 */
export function setMosqueContext(org) {
  if (!org) {
    mosqueContext = null;
    return;
  }
  mosqueContext = {
    name: org.name || 'Masjid Accounting',
    short_name: org.short_name || 'Masjid',
    currency: org.currency_symbol || '£'
  };
}

/**
 * Add a diagnostic breadcrumb
 * @param {string} category - e.g. 'ui.click', 'navigation', 'http', 'auth'
 * @param {string} message
 * @param {Object} [data]
 */
export function addBreadcrumb(category, message, data = {}) {
  const item = {
    timestamp: new Date().toISOString(),
    category,
    message,
    data: sanitizeBreadcrumbData(data)
  };

  breadcrumbs.push(item);
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }

  // Forward to external monitoring if Sentry is initialized
  if (typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.addBreadcrumb === 'function') {
    try {
      window.Sentry.addBreadcrumb({
        category,
        message,
        data,
        level: 'info'
      });
    } catch (e) {
      // Ignore Sentry forwarding error
    }
  }
}

/**
 * Strip sensitive PII from breadcrumb payload
 */
function sanitizeBreadcrumbData(data) {
  if (!data || typeof data !== 'object') return data;
  const copy = { ...data };
  const sensitiveKeys = ['password', 'token', 'secret', 'auth', 'cookie'];
  for (const k of Object.keys(copy)) {
    if (sensitiveKeys.some(s => k.toLowerCase().includes(s))) {
      copy[k] = '[REDACTED]';
    }
  }
  return copy;
}

/**
 * Capture and report an unhandled client error
 * @param {Error|string} error
 * @param {Object} [context]
 */
export function reportClientError(error, context = {}) {
  const errorPayload = {
    timestamp: new Date().toISOString(),
    message: error?.message || String(error),
    stack: error?.stack || null,
    name: error?.name || 'Error',
    context: sanitizeBreadcrumbData(context),
    user: userContext,
    mosque: mosqueContext,
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    breadcrumbs: [...breadcrumbs]
  };

  // 1. Output structured error to client console in all environments
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Masjid Accounting Error Telemetry]', errorPayload);
  }

  // 2. Dispatch to Sentry / Highlight if integrated in window or env
  if (typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.captureException === 'function') {
    try {
      window.Sentry.captureException(error, {
        extra: errorPayload
      });
    } catch (e) {
      // Ignore external forwarder error
    }
  }

  // 3. Dispatch to internal server audit error endpoint
  if (typeof fetch === 'function') {
    try {
      fetch('/api/audits/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorPayload),
        keepalive: true
      }).catch(() => {
        // Silently catch network errors during error dispatch
      });
    } catch (e) {
      // Ignore
    }
  }
}

// Global client listener registration
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    reportClientError(event.error || event.message, { source: 'window.onerror' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, { source: 'window.unhandledrejection' });
  });
}
