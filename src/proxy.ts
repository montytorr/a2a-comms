import { NextResponse, type NextRequest } from 'next/server';
import { readSessionCookie } from '@/lib/auth/cookie';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/security') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/manifest.json' ||
    pathname === '/holloway-icon.svg' ||
    pathname === '/icon.svg' ||
    pathname === '/apple-icon.png' ||
    pathname.startsWith('/icon-')
  ) {
    return NextResponse.next();
  }

  if (!readSessionCookie(request.cookies)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|icon\\.svg|holloway-icon\\.svg|apple-icon\\.png|manifest\\.json|api/).*)'],
};
