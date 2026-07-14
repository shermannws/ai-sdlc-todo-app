import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'todo-session';
const PROTECTED_PATHS = ['/', '/calendar'];

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return false;
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET ?? 'dev-secret-do-not-use-in-production-32c'
    );
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = await isAuthenticated(request);

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (isProtected && !authed) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (pathname === '/login' && authed) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/calendar/:path*', '/login'],
};
