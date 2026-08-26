import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'masjid_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'masjid-accounting-secret-key-change-in-prod-2026';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/**
 * Hash a password using PBKDF2 with a random salt (universally supported across Node and Cloudflare workerd)
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512');
  return `pbkdf2:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a plain password against a stored salt:hash string
 */
export function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;

  try {
    // 1. Direct plain text match fallback
    if (storedHash === password) return true;

    // 2. PBKDF2 format: "pbkdf2:salt:hexKey"
    if (storedHash.startsWith('pbkdf2:')) {
      const parts = storedHash.split(':');
      if (parts.length === 3) {
        const [, salt, key] = parts;
        const derivedKey = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512');
        return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
      }
    }

    // 3. Scrypt format: "salt:hexKey"
    if (storedHash.includes(':')) {
      const parts = storedHash.split(':');
      if (parts.length === 2) {
        const [salt, key] = parts;
        if (typeof crypto.scryptSync === 'function') {
          const derivedKey = crypto.scryptSync(password, salt, 64);
          return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
        }
      }
    }

    return false;
  } catch (err) {
    console.error("Password verification error:", err);
    return false;
  }
}

/**
 * Create a signed, tamper-proof session token
 */
export function createSessionToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name || user.email.split('@')[0],
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(payloadB64);
  const signature = hmac.digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Verify a session token and return the payload if valid
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;

  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(payloadB64);
  const expectedSig = hmac.digest('base64url');

  try {
    const isSigValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig)
    );
    if (!isSigValid) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    
    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}

import { readDB } from './db.js';

/**
 * Get current authenticated user from Next.js request cookies and verify active database status
 */
export function getAuthenticatedUser(request) {
  let token = null;

  // Check request cookies (Next.js Request or NextRequest)
  if (request.cookies && typeof request.cookies.get === 'function') {
    const cookieObj = request.cookies.get(SESSION_COOKIE_NAME);
    token = cookieObj?.value || cookieObj;
  } else if (request.headers && typeof request.headers.get === 'function') {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`));
      if (match) {
        token = match.split('=')[1];
      }
    }
  }

  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || !payload.id) return null;

  try {
    const db = readDB();
    const liveUser = (db.users || []).find(u => u.id === payload.id);
    if (!liveUser || liveUser.status !== 'ACTIVE') {
      return null;
    }

    return {
      id: liveUser.id,
      email: liveUser.email,
      role: liveUser.role,
      name: liveUser.name || liveUser.email.split('@')[0],
      status: liveUser.status
    };
  } catch (err) {
    return payload;
  }
}

/**
 * Build Set-Cookie header string for session
 */
export function buildSessionCookie(token) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieFlags = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(isProd ? ['Secure'] : [])
  ];
  return cookieFlags.join('; ');
}

/**
 * Build clear cookie header string for logout
 */
export function buildLogoutCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax;`;
}

export { SESSION_COOKIE_NAME };
