// Simple in-memory rate limiter for login endpoints.
// For single-node deployments this is sufficient. For multi-instance setups,
// replace this with a shared store (e.g., Redis or a Postgres table).

interface Bucket {
  attempts: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 10

export function isRateLimited(key: string): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    return { limited: false, retryAfterSeconds: 0 }
  }

  if (bucket.attempts >= MAX_ATTEMPTS) {
    return { limited: true, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  return { limited: false, retryAfterSeconds: 0 }
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { attempts: 1, resetAt: now + WINDOW_MS })
  } else {
    bucket.attempts += 1
  }
}

export function resetAttempts(key: string): void {
  buckets.delete(key)
}

// X-Forwarded-For is fully client-settable. Proxies *append* the real peer to
// the right of whatever the client sent, so the leftmost entry is attacker
// controlled - taking it (the old behavior) let anyone bypass every IP-keyed
// rate limit by rotating a fake first hop. Trust only the entries added by our
// own proxies: with a single trusted proxy (Railway) the rightmost entry is the
// real client; TRUSTED_PROXY_COUNT lets multi-hop deployments pick the right one.
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((p) => p.trim()).filter(Boolean)
    if (hops.length > 0) {
      const trusted = Math.max(1, Number(process.env.TRUSTED_PROXY_COUNT ?? '1') || 1)
      const idx = Math.max(0, hops.length - trusted)
      return hops[idx] || 'unknown'
    }
  }
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP.trim() || 'unknown'
  }
  return 'unknown'
}
