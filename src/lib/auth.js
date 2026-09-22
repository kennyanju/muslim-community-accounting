import crypto from 'crypto';
import { config } from './config.js';
import { readDB } from './db.js';

const SESSION_COOKIE_NAME = config.session.cookieName;
const SESSION_SECRET = config.session.secret;
const SESSION_MAX_AGE = config.session.maxAge;

/**
 * Hash a password using PBKDF2 with a random salt (600,000 iterations per NIST SP 800-63B)
 */
export function hashPassword(password, iterations = 600000) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512');
  return `pbkdf2:${iterations}:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a plain password against a stored salt:hash string
 */
export function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;

  try {
    // 1. Disallow plain-text password comparison (Security compliance - Item #9)

    // 2. PBKDF2 format: "pbkdf2:iterations:salt:hexKey" or legacy "pbkdf2:salt:hexKey"
    if (storedHash.startsWith('pbkdf2:')) {
      const parts = storedHash.split(':');
      if (parts.length === 4) {
        const [, iterStr, salt, key] = parts;
        const iterations = parseInt(iterStr, 10) || 600000;
        const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512');
        return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
      } else if (parts.length === 3) {
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
 * Create a signed, tamper-proof session token with unique JTI nonce (Item #10)
 */
export function createSessionToken(user, customJti = null) {
  const jti = customJti || crypto.randomUUID();
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name || user.email.split('@')[0],
    jti,
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

/**
 * Get current authenticated user from Next.js request cookies and verify active database status + session revocation
 */
export async function getAuthenticatedUser(request) {
  let token = null;

  // Check request cookies (Next.js Request or NextRequest)
  if (request?.cookies && typeof request.cookies.get === 'function') {
    const cookieObj = request.cookies.get(SESSION_COOKIE_NAME);
    token = cookieObj?.value || cookieObj;
  } else if (request?.headers && typeof request.headers.get === 'function') {
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

  // 1. Check D1 sessions table for revocation status (Item #10)
  try {
    const { getD1Database } = await import('./db-client.js');
    const db = await getD1Database();
    if (db && typeof db.prepare === 'function') {
      if (payload.jti) {
        const session = await db.prepare(`
          SELECT s.*, u.status, u.role, u.name, u.email
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.jti = ?
        `).bind(payload.jti).first();

        if (session) {
          if (session.revoked_at !== null || session.status !== 'ACTIVE') {
            return null;
          }
          return {
            id: session.user_id,
            email: session.email,
            role: session.role,
            name: session.name || session.email.split('@')[0],
            status: session.status,
            jti: session.jti
          };
        }
      }

      // If no session row or token predates sessions table, verify live user status
      const liveUser = await db.prepare(`SELECT id, email, role, name, status FROM users WHERE id = ?`).bind(payload.id).first();
      if (liveUser) {
        if (liveUser.status !== 'ACTIVE') return null;
        return {
          id: liveUser.id,
          email: liveUser.email,
          role: liveUser.role,
          name: liveUser.name || liveUser.email.split('@')[0],
          status: liveUser.status,
          jti: payload.jti
        };
      }
    }
  } catch (_) {}

  // 2. Fallback to readDB for test environments
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
      status: liveUser.status,
      jti: payload.jti
    };
  } catch (err) {
    return payload;
  }
}

/**
 * Synchronous variant of getAuthenticatedUser for synchronous tests
 */
export function getAuthenticatedUserSync(request) {
  let token = null;
  if (request?.cookies && typeof request.cookies.get === 'function') {
    const cookieObj = request.cookies.get(SESSION_COOKIE_NAME);
    token = cookieObj?.value || cookieObj;
  } else if (request?.headers && typeof request.headers.get === 'function') {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`));
      if (match) {
        token = match.split('=')[1];
      }
    }
  }

  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Revoke a session by its JTI nonce
 */
export async function revokeSession(jti) {
  try {
    const { getD1Database } = await import('./db-client.js');
    const db = await getD1Database();
    if (db && typeof db.prepare === 'function') {
      await db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE jti = ?`).bind(jti).run();
    }
  } catch (e) {
    console.error('Failed to revoke session:', e.message);
  }
}

/**
 * Revoke all active sessions for a user (e.g. on deactivation or password reset)
 */
export async function revokeUserSessions(userId) {
  try {
    const { getD1Database } = await import('./db-client.js');
    const db = await getD1Database();
    if (db && typeof db.prepare === 'function') {
      await db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).bind(userId).run();
    }
  } catch (e) {
    console.error('Failed to revoke user sessions:', e.message);
  }
}

/**
 * Strip sensitive credentials (password_hash) from user objects
 */
export function getSafeUser(user) {
  if (!user || typeof user !== 'object') return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

/**
 * RBAC Granular Permissions Checker
 */
export const ROLE_PERMISSIONS = {
  ADMIN: ['*'],
  REVIEWER: ['read:all', 'export:reports', 'print:receipts', 'approve:transactions'],
  AUDITOR: ['read:all', 'export:reports', 'export:giftaid', 'read:audits', 'print:receipts'],
};

export function hasPermission(role, permission) {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role] || [];
  if (perms.includes('*')) return true;
  if (perms.includes('read:all') && permission.startsWith('read:')) return true;
  return perms.includes(permission);
}

export function requireRole(user, allowedRoles = ['ADMIN']) {
  if (!user) {
    return { ok: false, status: 401, message: 'Unauthorized: Authentication required' };
  }
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.includes(user.role)) {
    return { ok: false, status: 403, message: `Forbidden: Access restricted to ${roles.join(' / ')}` };
  }
  return { ok: true };
}

export function requirePermission(user, permission) {
  if (!user) {
    return { ok: false, status: 401, message: 'Unauthorized: Authentication required' };
  }
  if (!hasPermission(user.role, permission)) {
    return { ok: false, status: 403, message: `Forbidden: Missing required permission '${permission}'` };
  }
  return { ok: true };
}

/**
 * Build Set-Cookie header string for session
 */
export function buildSessionCookie(token) {
  const isProd = config.isProd;
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
