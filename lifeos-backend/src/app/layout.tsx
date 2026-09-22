import type { Metadata } from 'next';

// lifeos-backend is an API-only service — see AGENTS.md / the repo root
// ROADMAP.md. This layout exists only because Next.js's app router requires
// one; there is no page UI here. The client is lifeos-frontend (Expo/React
// Native), which talks to this backend's /api/* routes, never to any page
// rendered from this project.
export const metadata: Metadata = {
  title: 'LifeOS API',
  description: 'LifeOS backend API — no user-facing pages.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
