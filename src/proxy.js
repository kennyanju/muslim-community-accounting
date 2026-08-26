import { NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'masjid_session';

export function proxy(request) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const token = sessionCookie?.value || sessionCookie;
  const hasSession = !!token && typeof token === 'string' && token.length > 20;

  const { pathname } = request.nextUrl;

  // Public paths that do NOT require authentication
  const isPublicPath = 
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/organisation' ||
    pathname === '/api/docs';

  // If path is API and not public, require session cookie
  if (pathname.startsWith('/api/')) {
    if (!isPublicPath && !hasSession) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // If visiting a protected page without session, redirect to /login
  if (!isPublicPath && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated user visits /login, redirect to dashboard /
  if (pathname === '/login' && hasSession) {
    const dashboardUrl = new URL('/', request.url);
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
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
