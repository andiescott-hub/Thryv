/**
 * Next.js Edge Middleware
 *
 * Runs before every matched request to:
 *   1. Add security headers
 *   2. Apply CORS rules
 *   3. Block oversized bodies early (Content-Length guard)
 *
 * Note: Full per-IP rate limiting lives inside the API route handler because
 * Edge middleware does not share memory with Node.js API route processes.
 */

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply strict rules to our API routes
  if (pathname.startsWith('/api/')) {
    // Reject suspiciously large bodies early — but exempt the upload routes
    const contentLength = request.headers.get('content-length');
    let bodyLimit = 50_000; // 50 KB default
    if (pathname === '/api/upload') bodyLimit = 5 * 1024 * 1024; // 5 MB for file uploads
    else if (pathname === '/api/upload-text') bodyLimit = 250_000; // 250 KB for pasted text
    if (contentLength && Number(contentLength) > bodyLimit) {
      return new NextResponse(
        JSON.stringify({ error: 'Request body too large' }),
        { status: 413, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }
  }

  const response = NextResponse.next();

  // Security headers for all routes
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );

  // CORS headers for API routes
  if (pathname.startsWith('/api/')) {
    const cors = corsHeaders();
    Object.entries(cors).forEach(([k, v]) => response.headers.set(k, v));
  }

  return response;
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
