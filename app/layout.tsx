import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Thryv RAG – Document Intelligence',
  description:
    'Ask questions against your private document library. Powered by Chroma + kimi-k2.5.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
