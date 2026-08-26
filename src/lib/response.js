import { NextResponse } from 'next/server';

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

  return NextResponse.json(body, { status, headers });
}

/**
 * Create a standard error JSON response
 * @param {string} message - Human-readable error description
 * @param {number} status - HTTP status code (e.g. 400, 401, 403, 404, 429, 500)
 * @param {Object} options - { code: string, details: any, headers: object }
 */
export function apiError(message = 'An error occurred', status = 400, options = {}) {
  const { code = 'ERROR', details = null, headers = {} } = options;

  const body = {
    success: false,
    error: {
      code,
      message,
    }
  };

  if (details) body.error.details = details;

  return NextResponse.json(body, { status, headers });
}
