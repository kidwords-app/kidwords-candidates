import { auth } from '@/auth';
import { NextResponse } from 'next/server';

// Skip auth entirely when using the mock provider (local dev / offline)
export const middleware = process.env.PROVIDER === 'mock'
  ? () => NextResponse.next()
  : auth;

export const config = {
  // Protect every route except the login page and Next.js internals
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
};
