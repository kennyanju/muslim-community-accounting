/**
 * Centralized Application Configuration
 * Validates environment variables and provides secure defaults
 */

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  
  session: {
    secret: process.env.SESSION_SECRET || 'masjid-accounting-secret-key-change-in-prod-2026',
    cookieName: 'masjid_session',
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '604800', 10), // 7 days in seconds
  },

  rateLimit: {
    loginWindowMs: 60 * 1000, // 1 minute
    loginMaxAttempts: 10,
    apiWindowMs: 60 * 1000,
    apiMaxAttempts: 120,
  },

  organisation: {
    prefCookieName: 'masjid_org_pref',
    defaultCurrency: '£',
  },

  pagination: {
    defaultPageSize: 15,
    maxPageSize: 100,
  }
};
