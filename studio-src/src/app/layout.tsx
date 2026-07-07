import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZFIT Motion — Fitness Video Editor',
  description:
    "The training-video editor for Zeb's Platinum Fitness: upload exercise clips, wrap them in the ZFIT series package, and export MP4 with music and voiceover.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
