import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL ?? 'postgres://itsasecret:itsasecret@localhost:5432/itsasecret'

const client = postgres(connectionString, { max: 10 })

export const db = drizzle(client, { schema })
