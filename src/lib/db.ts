import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const isDev =
  process.env.APP_ENV === 'development' ||
  (process.env.NODE_ENV !== 'production' && !process.env.APP_ENV)

export const devDatabaseUrl = 'postgres://itsasecret:itsasecret@localhost:5432/itsasecret'

if (!process.env.DATABASE_URL && !isDev) {
  throw new Error('DATABASE_URL must be set outside local development')
}

const connectionString = process.env.DATABASE_URL ?? devDatabaseUrl

// Valid PostgreSQL sslmodes that keep the connection encrypted (bare
// 'verify' is not one of them), matched to end-of-value so a lookalike
// query parameter cannot satisfy the check.
//
// TLS is required for public hosts only. Private-network hosts (Railway
// internal networking, RFC1918 ranges, link-local, loopback) don't support
// TLS on their internal interfaces at all, and the requirement previously
// hard-crashed the process at import time when DATABASE_URL pointed at one -
// taking down the whole deploy.
function isPrivateDbHost(connectionUrl: string): boolean {
  try {
    const host = new URL(connectionUrl).hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
    // Railway internal DNS.
    if (host.endsWith('.railway.internal') || host.endsWith('.internal')) return true
    // RFC1918 + link-local.
    if (/^10\./.test(host)) return true
    if (/^192\.168\./.test(host)) return true
    const m = host.match(/^172\.(\d{1,3})\./)
    if (m) {
      const second = parseInt(m[1], 10)
      if (second >= 16 && second <= 31) return true
    }
    if (/^169\.254\./.test(host)) return true
    return false
  } catch {
    return false
  }
}
if (!isDev && !isPrivateDbHost(connectionString) && !/sslmode=(require|verify-ca|verify-full)([&#]|$)/.test(connectionString)) {
  throw new Error(
    'DATABASE_URL must use TLS outside local development: append sslmode=require (or verify-full)',
  )
}

const client = postgres(connectionString, { max: 10 })

export const db = drizzle(client, { schema })
