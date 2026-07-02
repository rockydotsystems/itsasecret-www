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

export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim() || 'unknown'
  }
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }
  return 'unknown'
}
