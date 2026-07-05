import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

// Applies pending drizzle migrations from the `drizzle/` folder (copied into
// the runtime image next to .output). Runs before the server starts serving:
// if a migration fails, the process exits, the deployment never passes
// healthcheck, and Railway keeps the previous deployment live. Safe with the
// pinned single replica — no concurrent migrator.
export async function migrateOnBoot(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://itsasecret:itsasecret@localhost:5432/itsasecret'
  const client = postgres(connectionString, { max: 1 })
  try {
    await migrate(drizzle(client), { migrationsFolder: 'drizzle' })
    console.log('Database migrations up to date')
  } finally {
    await client.end()
  }
}
