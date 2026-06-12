import { NextResponse } from 'next/server';

export function middleware(request) {
  const session = request.cookies.get('bsmc_session');

  const { pathname } = request.nextUrl;

  // Paths requiring authentication
  const isProtectedPath = pathname === '/' || pathname.startsWith('/api/') && !pathname.startsWith('/api/auth');

  if (isProtectedPath && !session) {
    // Redirect to login page
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login' && session) {
    // Redirect already authenticated users to dashboard
    const dashboardUrl = new URL('/', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
