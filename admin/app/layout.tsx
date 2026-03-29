import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KidWords Admin',
  description: 'Review and approve word candidates',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
