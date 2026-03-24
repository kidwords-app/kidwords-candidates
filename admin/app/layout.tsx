import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KidWords Admin',
  description: 'Review and approve word candidates',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning prevents noise from browser extensions
          (e.g. Feedly) that inject attributes into <body> before hydration */}
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
