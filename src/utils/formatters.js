/**
 * Centralized Locale, Date, Time and Currency Formatters using standard Intl APIs
 */

/**
 * Returns the detected user browser locale with safe fallback
 * @returns {string}
 */
export function getUserLocale() {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en-GB';
}

/**
 * Returns the detected user system timezone with safe fallback
 * @returns {string}
 */
export function getUserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
  } catch (e) {
    return 'Europe/London';
  }
}

/**
 * Common Islamic and international currency symbol to ISO-4217 code map
 */
const CURRENCY_MAP = {
  '£': 'GBP',
  '$': 'USD',
  '€': 'EUR',
  '₦': 'NGN',
  'CA$': 'CAD',
  'CAD': 'CAD',
  'A$': 'AUD',
  'AUD': 'AUD',
  'NZ$': 'NZD',
  'NZD': 'NZD',
  'ر.س': 'SAR',
  'SAR': 'SAR',
  'د.إ': 'AED',
  'AED': 'AED',
  '₨': 'PKR',
  'PKR': 'PKR',
  '₹': 'INR',
  'INR': 'INR',
  '₺': 'TRY',
  'TRY': 'TRY',
  'RM': 'MYR',
  'MYR': 'MYR',
  'Rp': 'IDR',
  'IDR': 'IDR',
  '৳': 'BDT',
  'BDT': 'BDT',
  'R': 'ZAR',
  'ZAR': 'ZAR',
  'KSh': 'KES',
  'KES': 'KES',
  'GH₵': 'GHS',
  'GHS': 'GHS',
  'EGP': 'EGP',
  'QAR': 'QAR',
  'KWD': 'KWD',
  'BHD': 'BHD',
  'OMR': 'OMR'
};

/**
 * Format currency amount with proper locale and symbol using Intl.NumberFormat
 * @param {number|string} amount
 * @param {string} currencySymbol - Symbol or ISO code
 * @param {string} [locale]
 * @returns {string}
 */
export function formatCurrency(amount, currencySymbol = '£', locale = null) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || num === null || num === undefined) {
    return `${currencySymbol}0.00`;
  }

  const targetLocale = locale || getUserLocale();

  try {
    const rawCode = (currencySymbol || '').trim();
    const currencyCode = CURRENCY_MAP[rawCode] || (rawCode.length === 3 ? rawCode.toUpperCase() : 'GBP');

    return new Intl.NumberFormat(targetLocale, {
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
 * @param {Object} [options]
 * @param {string} [locale]
 * @returns {string}
 */
export function formatDate(dateVal, options = {}, locale = null) {
  if (!dateVal) return '—';
  
  const targetLocale = locale || getUserLocale();

  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal.includes('T') ? dateVal : `${dateVal}T00:00:00`) : new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);

    const defaultOptions = {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: getUserTimeZone(),
      ...options
    };

    return new Intl.DateTimeFormat(targetLocale, defaultOptions).format(d);
  } catch (err) {
    return String(dateVal);
  }
}

/**
 * Format a date and time for audit logs / timestamps
 * @param {string|Date} dateVal
 * @param {string} [locale]
 * @returns {string}
 */
export function formatDateTime(dateVal, locale = null) {
  if (!dateVal) return '—';

  const targetLocale = locale || getUserLocale();

  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);

    return new Intl.DateTimeFormat(targetLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: getUserTimeZone(),
      hour12: false
    }).format(d);
  } catch (err) {
    return String(dateVal);
  }
}
