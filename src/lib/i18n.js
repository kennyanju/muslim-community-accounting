import { en } from '@/locales/en';

/**
 * Simple key-path translator helper: t('app.dashboard') -> 'Dashboard'
 */
export function t(path, fallback = '') {
  if (!path) return fallback;
  const parts = path.split('.');
  let current = en;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return fallback || path;
    }
  }
  return typeof current === 'string' ? current : (fallback || path);
}
