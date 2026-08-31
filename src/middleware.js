import { NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'masjid_session';

/**
 * Lightweight edge session validity checker
 */
function isSessionValid(token) {
  if (!token || typeof token !== 'string' || token.length < 20) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  try {
    const payloadJson = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);
    if (!payload || !payload.id) return false;

    // Check expiration timestamp in seconds
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Validates Origin/Referer against Host header and whitelisted domains (CORS & CSRF Defense)
 */
function isAllowedOrigin(origin, host) {
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    if (originUrl.host === host) return true;

    // Check configured environment origins
    const allowedEnv = [
      process.env.NEXT_PUBLIC_APP_URL,
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
    ].filter(Boolean);

    return allowedEnv.some(allowed => {
      try {
        const parsed = new URL(allowed.trim());
        return parsed.host === originUrl.host;
      } catch (e) {
        return false;
      }
    });
  } catch (e) {
    return false;
  }
}

/**
 * Validates Origin/Referer against Host header for state-mutating requests (CSRF Defense)
 */
function isValidOrigin(request) {
  const method = request.method?.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  
  if (!origin) {
    // If no origin header is provided, check referer header if present
    const referer = request.headers.get('referer');
    if (!referer) return true; // Native direct fetch
    try {
      const refUrl = new URL(referer);
      return refUrl.host === host || isAllowedOrigin(referer, host);
    } catch (e) {
      return false;
    }
  }

  return isAllowedOrigin(origin, host);
}

/**
 * Apply Standard Security Headers & Dynamic CORS
 */
function applySecurityAndCorsHeaders(response, request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  // Dynamic CORS origin reflection (strictly whitelist-based, never wildcard with credentials)
  if (origin && isAllowedOrigin(origin, host)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With');
    response.headers.set('Access-Control-Max-Age', '86400');
  }

  // Strict Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  return response;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const method = request.method?.toUpperCase();
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  // 1. CORS Preflight OPTIONS Handling
  if (method === 'OPTIONS') {
    const preflightRes = new NextResponse(null, { status: 204 });
    if (origin && isAllowedOrigin(origin, host)) {
      preflightRes.headers.set('Access-Control-Allow-Origin', origin);
      preflightRes.headers.set('Access-Control-Allow-Credentials', 'true');
      preflightRes.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      preflightRes.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With');
      preflightRes.headers.set('Access-Control-Max-Age', '86400');
    }
    return preflightRes;
  }

  // 2. CSRF Protection for state mutations
  if (!isValidOrigin(request)) {
    const errorRes = NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'CSRF validation failed: Cross-origin mutation blocked.' } },
      { status: 403 }
    );
    return applySecurityAndCorsHeaders(errorRes, request);
  }

  // 3. Enforce Max Request Payload Size (1MB default, 10MB for database backups)
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    const maxLimit = pathname.startsWith('/api/backup') ? 10 * 1024 * 1024 : 1 * 1024 * 1024;
    if (contentLength > maxLimit) {
      const payloadErrorRes = NextResponse.json(
        { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: `Request payload exceeds maximum permitted size of ${maxLimit / (1024 * 1024)}MB.` } },
        { status: 413 }
      );
      return applySecurityAndCorsHeaders(payloadErrorRes, request);
    }
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const token = sessionCookie?.value || sessionCookie;
  const hasSession = isSessionValid(token);

  // Public paths that do NOT require authentication
  const isPublicPath = 
    pathname === '/login' ||
    pathname === '/not-found' ||
    pathname === '/manifest.json' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/organisation' ||
    pathname === '/api/docs' ||
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/api/audits/client-error');

  // If path is API and not public, require session cookie
  if (pathname.startsWith('/api/')) {
    if (!isPublicPath && !hasSession) {
      const unauthorizedRes = NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required or session expired' } },
        { status: 401 }
      );
      return applySecurityAndCorsHeaders(unauthorizedRes, request);
    }
    const nextRes = NextResponse.next();
    return applySecurityAndCorsHeaders(nextRes, request);
  }

  // If visiting a protected page without valid session, redirect to /login with redirect query param
  if (!isPublicPath && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    const redirectRes = NextResponse.redirect(loginUrl);
    return applySecurityAndCorsHeaders(redirectRes, request);
  }

  // If authenticated user visits /login, redirect to dashboard / or redirect destination
  if (pathname === '/login' && hasSession) {
    const redirectParam = request.nextUrl.searchParams.get('redirect');
    const destination = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/';
    const dashboardUrl = new URL(destination, request.url);
    const redirectRes = NextResponse.redirect(dashboardUrl);
    return applySecurityAndCorsHeaders(redirectRes, request);
  }

  const nextRes = NextResponse.next();
  return applySecurityAndCorsHeaders(nextRes, request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json).*)',
  ],
};
