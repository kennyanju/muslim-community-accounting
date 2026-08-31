/**
 * Security & Sanitization Library for Masjid Accounting
 * Defends against Stored XSS, Reflected XSS, and CSV Formula Injection (DDE)
 */

/**
 * Strips dangerous HTML tags, javascript: pseudo-protocols, and inline event handlers from user text
 * @param {string} input - Raw user input string
 * @returns {string} - Cleaned safe text
 */
export function sanitizeText(input) {
  if (typeof input !== 'string') return input;
  if (!input) return '';

  let cleaned = input.trim();

  // 1. Remove script tags and contents
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // 2. Remove iframe, object, embed, form tags
  cleaned = cleaned.replace(/<\/?(iframe|object|embed|form|input|button|style|meta|link)[^>]*>/gi, '');

  // 3. Remove javascript: and vbscript: pseudo-protocols
  cleaned = cleaned.replace(/javascript\s*:/gi, '');
  cleaned = cleaned.replace(/vbscript\s*:/gi, '');
  cleaned = cleaned.replace(/data\s*:\s*text\/html/gi, '');

  // 4. Remove inline event handlers (onerror=, onload=, onclick=, onmouseover=, etc.)
  cleaned = cleaned.replace(/on\w+\s*=\s*(['"]).*?\1/gi, '');
  cleaned = cleaned.replace(/on\w+\s*=\s*[^ >]+/gi, '');

  // 5. Neutralize angle brackets if remaining as raw tags
  cleaned = cleaned.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return cleaned;
}

/**
 * Sanitizes and escapes values for CSV output to prevent CSV Formula Injection (Excel / LibreOffice DDE)
 * Vulnerable leading characters: '=', '+', '-', '@', '\t', '\r'
 * @param {any} val - Cell value
 * @returns {string} - Safe escaped CSV string
 */
export function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  
  let str = String(val).trim();

  // Defend against formula injection if cell begins with dangerous calculation trigger
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousPrefixes.some(prefix => str.startsWith(prefix))) {
    str = `'${str}`;
  }

  // Escape inner double quotes by doubling them (" -> "")
  str = str.replace(/"/g, '""');

  return `"${str}"`;
}

/**
 * Recursively sanitizes all string properties within an object or array
 * @param {any} obj - Input payload
 * @returns {any} - Sanitized payload
 */
export function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizeText(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
}
