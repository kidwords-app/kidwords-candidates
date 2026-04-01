
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

// Comma-separated list of GitHub login handles allowed to access the admin.
// e.g. ALLOWED_GITHUB_LOGINS=sumitasami,otheruser
const ALLOWED = (process.env.ALLOWED_GITHUB_LOGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId:     process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    signIn({ profile }) {
      if (ALLOWED.length === 0) return true; // no allowlist → any GitHub user can sign in
      return ALLOWED.includes((profile as { login?: string } | undefined)?.login ?? '');
    },
  },
  pages: {
    signIn: '/login',
  },
});
