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
      return refUrl.host === host;
    } catch (e) {
      return false;
    }
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch (e) {
    return false;
  }
}

export function middleware(request) {
  // 1. CSRF Protection for state mutations
  if (!isValidOrigin(request)) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'CSRF validation failed: Cross-origin mutation blocked.' } },
      { status: 403 }
    );
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const token = sessionCookie?.value || sessionCookie;
  const hasSession = isSessionValid(token);

  const { pathname } = request.nextUrl;

  // Public paths that do NOT require authentication
  const isPublicPath = 
    pathname === '/login' ||
    pathname === '/not-found' ||
    pathname === '/manifest.json' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/organisation' ||
    pathname === '/api/docs' ||
    pathname.startsWith('/api/audits/client-error');

  // If path is API and not public, require session cookie
  if (pathname.startsWith('/api/')) {
    if (!isPublicPath && !hasSession) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required or session expired' } },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // If visiting a protected page without valid session, redirect to /login with redirect query param
  if (!isPublicPath && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated user visits /login, redirect to dashboard / or redirect destination
  if (pathname === '/login' && hasSession) {
    const redirectParam = request.nextUrl.searchParams.get('redirect');
    const destination = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/';
    const dashboardUrl = new URL(destination, request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
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
