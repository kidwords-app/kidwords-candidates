export { auth as middleware } from '@/auth';

export const config = {
  // Protect every route except the login page and Next.js internals
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
};
