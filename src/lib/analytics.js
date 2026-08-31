/**
 * Clean, Typed, Privacy-Preserving Telemetry & Analytics System with Deduplication
 */

import { addBreadcrumb } from './errorReporting.js';

// Sliding window cache to prevent duplicate rapid events (e.g. double clicks or StrictMode re-renders)
const recentEventsCache = new Map();
const DEDUP_WINDOW_MS = 1000;

/**
 * Clean up stale keys in dedup window
 */
function cleanupDedupCache() {
  const now = Date.now();
  for (const [key, timestamp] of recentEventsCache.entries()) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentEventsCache.delete(key);
    }
  }
}

/**
 * Check if event is duplicate within time window
 * @param {string} eventSignature
 * @returns {boolean}
 */
function isDuplicateEvent(eventSignature) {
  cleanupDedupCache();
  const now = Date.now();
  if (recentEventsCache.has(eventSignature)) {
    return true;
  }
  recentEventsCache.set(eventSignature, now);
  return false;
}

/**
 * Core event tracking engine
 * @param {string} eventName
 * @param {Object} [properties]
 * @returns {boolean} whether the event was successfully dispatched (not a duplicate)
 */
export function trackEvent(eventName, properties = {}) {
  if (!eventName || typeof eventName !== 'string') return false;

  // Generate unique signature for deduplication
  const signature = `${eventName}:${JSON.stringify(properties)}`;
  if (isDuplicateEvent(signature)) {
    return false;
  }

  // Strip potential PII before dispatching
  const sanitizedProps = sanitizeTelemetryProps(properties);

  const eventPayload = {
    event: eventName,
    properties: sanitizedProps,
    timestamp: new Date().toISOString()
  };

  // Add diagnostic breadcrumb for error monitoring correlation
  addBreadcrumb('telemetry', `Event: ${eventName}`, sanitizedProps);

  // Dispatch to console in development
  if (process.env.NODE_ENV !== 'production') {
    // Development telemetry log
  }

  // Forward to window telemetry providers if present (Google Analytics, Plausible, PostHog, etc.)
  if (typeof window !== 'undefined') {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, sanitizedProps);
    }
    if (typeof window.plausible === 'function') {
      window.plausible(eventName, { props: sanitizedProps });
    }
  }

  return true;
}

/**
 * Remove PII (passwords, email, donor personal identifiers) from telemetry
 */
function sanitizeTelemetryProps(props) {
  if (!props || typeof props !== 'object') return {};
  const copy = { ...props };
  const blockedKeys = ['password', 'donor_name', 'name', 'email', 'address', 'postcode', 'token', 'secret'];

  for (const k of Object.keys(copy)) {
    if (blockedKeys.some(b => k.toLowerCase().includes(b))) {
      delete copy[k];
    }
  }
  return copy;
}

/**
 * Track pageview / tab switch with deduplication
 * @param {string} pathOrTab
 * @param {string} [title]
 */
export function trackPageView(pathOrTab, title = '') {
  return trackEvent('page_view', {
    path: pathOrTab,
    title: title || pathOrTab
  });
}

/**
 * Track transaction creation
 * @param {Object} tx
 */
export function trackTransactionRecorded({ type, category, amount, fundCount }) {
  return trackEvent('transaction_recorded', {
    type: type?.toUpperCase(),
    category,
    amount: typeof amount === 'number' ? amount : parseFloat(amount) || 0,
    fund_count: fundCount || 1
  });
}

/**
 * Track Jummah collection logging
 * @param {Object} jummah
 */
export function trackJummahLogged({ totalAmount, splitCount }) {
  return trackEvent('jummah_logged', {
    total_amount: typeof totalAmount === 'number' ? totalAmount : parseFloat(totalAmount) || 0,
    split_count: splitCount || 1
  });
}

/**
 * Track donor registration
 * @param {Object} donor
 */
export function trackDonorRegistered({ giftAidEligible }) {
  return trackEvent('donor_registered', {
    gift_aid_eligible: Boolean(giftAidEligible)
  });
}

/**
 * Track report / CSV export
 * @param {string} reportType
 * @param {string} format
 */
export function trackReportExported(reportType, format = 'csv') {
  return trackEvent('report_exported', {
    report_type: reportType,
    format
  });
}

/**
 * Track theme change
 * @param {string} theme
 */
export function trackThemeChanged(theme) {
  return trackEvent('theme_changed', {
    theme
  });
}
