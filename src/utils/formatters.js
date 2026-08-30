/**
 * Centralized Locale, Date, Time and Currency Formatters using standard Intl APIs
 */

/**
 * Format currency amount with proper locale and symbol
 * @param {number|string} amount
 * @param {string} currencySymbol - Fallback symbol if not matching standard currency code
 * @param {string} locale
 * @returns {string}
 */
export function formatCurrency(amount, currencySymbol = '£', locale = 'en-GB') {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || num === null || num === undefined) {
    return `${currencySymbol}0.00`;
  }

  try {
    // Map common symbols to currency codes
    let currencyCode = 'GBP';
    if (currencySymbol === '$') currencyCode = 'USD';
    else if (currencySymbol === '€') currencyCode = 'EUR';
    else if (currencySymbol === '₦') currencyCode = 'NGN';
    else if (currencySymbol === 'CA$' || currencySymbol === 'CAD') currencyCode = 'CAD';

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  } catch (err) {
    return `${currencySymbol}${num.toFixed(2)}`;
  }
}

/**
 * Format a date string or timestamp using Intl.DateTimeFormat
 * @param {string|Date} dateVal
 * @param {Object} options
 * @param {string} locale
 * @returns {string}
 */
export function formatDate(dateVal, options = {}, locale = 'en-GB') {
  if (!dateVal) return '—';
  
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal.includes('T') ? dateVal : `${dateVal}T00:00:00`) : new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);

    const defaultOptions = {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...options
    };

    return new Intl.DateTimeFormat(locale, defaultOptions).format(d);
  } catch (err) {
    return String(dateVal);
  }
}

/**
 * Format a date and time for audit logs / timestamps
 * @param {string|Date} dateVal
 * @param {string} locale
 * @returns {string}
 */
export function formatDateTime(dateVal, locale = 'en-GB') {
  if (!dateVal) return '—';

  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);

    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d);
  } catch (err) {
    return String(dateVal);
  }
}
