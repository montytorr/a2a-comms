import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/cookie';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/security') ||
    // The public landing page. Reachable directly by anyone, signed in or not,
    // so the marketing surface has a stable URL of its own to link to.
    pathname === '/home' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/manifest.json' ||
    pathname === '/apple-icon.png' ||
    pathname.startsWith('/icon-')
  ) {
    return NextResponse.next();
  }

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    // `/` is the one path where "not signed in" is not an error. Someone who
    // followed a link from GitHub gets the landing page; before AC-82 they got
    // a login form for an account they cannot create, which is a strange thing
    // for a public repository's only URL to do.
    //
    // A REWRITE, not a redirect: the address bar keeps the bare domain, so the
    // homepage has the URL a homepage should have, and a signed-in visitor
    // hitting the same `/` still lands on their dashboard with nothing moved.
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/home', request.url));
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|apple-icon\\.png|manifest\\.json|api/).*)'],
};
