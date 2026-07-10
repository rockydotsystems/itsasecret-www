import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const isDev =
  process.env.APP_ENV === 'development' ||
  (process.env.NODE_ENV !== 'production' && !process.env.APP_ENV)

if (!process.env.DATABASE_URL && !isDev) {
  throw new Error('DATABASE_URL must be set outside local development')
}

const connectionString = process.env.DATABASE_URL ?? 'postgres://itsasecret:itsasecret@localhost:5432/itsasecret'

const client = postgres(connectionString, { max: 10 })

export const db = drizzle(client, { schema })
