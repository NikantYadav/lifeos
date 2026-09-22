import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Browser clients (the Expo web build) need CORS headers; native clients do
 * not send an Origin and are unaffected. Auth is Bearer-token only, so no
 * Access-Control-Allow-Credentials is needed — see lib/auth.ts.
 */
const allowedOrigins = [
  'http://localhost:8081',
  'http://localhost:19006',
];

const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  if (request.method === 'OPTIONS') {
    return NextResponse.json(
      {},
      {
        headers: {
          ...(isAllowedOrigin && { 'Access-Control-Allow-Origin': origin }),
          ...corsHeaders,
          Vary: 'Origin',
        },
      }
    );
  }

  const response = NextResponse.next();

  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  response.headers.set('Vary', 'Origin');

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
