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
if (!isDev && !/sslmode=(require|verify-ca|verify-full)([&#]|$)/.test(connectionString)) {
  throw new Error(
    'DATABASE_URL must use TLS outside local development: append sslmode=require (or verify-full)',
  )
}

const client = postgres(connectionString, { max: 10 })

export const db = drizzle(client, { schema })
