/**
 * Standardized API Response Envelope Helpers
 */

/**
 * Create a successful JSON response
 * @param {*} data - Payload data
 * @param {Object} options - { status: 200, message: string, meta: object, headers: object }
 */
export function apiSuccess(data = null, options = {}) {
  const { status = 200, message = null, meta = null, headers = {} } = options;
  
  const body = {
    success: true,
  };

  if (message) body.message = message;
  if (meta) body.meta = meta;
  if (data !== null && data !== undefined) body.data = data;

  return Response.json(body, { status, headers });
}

/**
 * Create a standard error JSON response with automatic 500-level error sanitization
 * @param {string} message - Human-readable error description
 * @param {number} status - HTTP status code (e.g. 400, 401, 403, 404, 429, 500)
 * @param {Object} options - { code: string, details: any, headers: object }
 */
export function apiError(message = 'An error occurred', status = 400, options = {}) {
  const { code = 'ERROR', details = null, headers = {} } = options;

  let safeMessage = message;
  let safeDetails = details;

  // Sanitize 500 internal server errors in production to avoid leaking database paths, queries, or stack traces
  if (status >= 500 && process.env.NODE_ENV === 'production') {
    safeMessage = 'An unexpected server error occurred. Please contact administration.';
    safeDetails = null;
  }

  const body = {
    success: false,
    error: {
      code,
      message: safeMessage,
    }
  };

  if (safeDetails !== null && safeDetails !== undefined) {
    body.error.details = safeDetails;
  }

  return Response.json(body, { status, headers });
}
