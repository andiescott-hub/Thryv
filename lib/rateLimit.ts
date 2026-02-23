/**
 * Simple in-memory rate limiter.
 *
 * Works correctly for single-process deployments (local dev, single Vercel
 * instance). For multi-instance production deployments, replace the Map with
 * an Upstash Redis adapter (see README for upgrade path).
 *
 * Defaults (configurable via env):
 *   RATE_LIMIT_WINDOW_MS  = 60000  (1 minute)
 *   RATE_LIMIT_MAX        = 20     (requests per window per IP)
 */

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? '60000');
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX ?? '20');

interface BucketEntry {
  count: number;
  resetAt: number;
}

// Shared state across requests within the same process
const buckets = new Map<string, BucketEntry>();

/**
 * Returns `true` if the request is allowed; `false` if the rate limit is exceeded.
 * Also returns the current window metadata for response headers.
 */
export function checkRateLimit(identifier: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();

  let entry = buckets.get(identifier);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(identifier, entry);
  }

  entry.count++;

  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  const allowed = entry.count <= MAX_REQUESTS;

  return { allowed, remaining, resetAt: entry.resetAt };
}

// Periodically prune expired entries to prevent unbounded memory growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets.entries()) {
      if (now >= entry.resetAt) buckets.delete(key);
    }
  }, WINDOW_MS * 2);
}
