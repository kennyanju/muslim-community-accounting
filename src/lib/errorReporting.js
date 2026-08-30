/**
 * Lightweight Client-Side Error Reporting & Breadcrumbs Collector
 */

const breadcrumbs = [];
const MAX_BREADCRUMBS = 20;

export function addBreadcrumb(category, message, data = {}) {
  const item = {
    timestamp: new Date().toISOString(),
    category,
    message,
    data
  };

  breadcrumbs.push(item);
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}

export function reportClientError(error, context = {}) {
  const errorPayload = {
    timestamp: new Date().toISOString(),
    message: error?.message || String(error),
    stack: error?.stack || null,
    context,
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    breadcrumbs: [...breadcrumbs]
  };

  // Log structured error to client console in development/production
  console.error('[Masjid Accounting Error Report]', errorPayload);

  // Optional: Send to internal telemetry/audit endpoint without throwing
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
