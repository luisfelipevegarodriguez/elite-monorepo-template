import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Elite Monorepo Web',
  description: 'Next.js 15 + Turborepo + TypeScript strict',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
