import Database from 'better-sqlite3'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dbPath = process.env.DATABASE_PATH || 'itsasecret.db'
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

const migrationsDir = join(process.cwd(), 'migrations')
if (!existsSync(migrationsDir)) {
  console.error('No migrations directory found at', migrationsDir)
  process.exit(1)
}

const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
const applied = new Set(
  db.prepare('SELECT filename FROM _migrations').all().map((r: { filename: string }) => r.filename)
)

for (const file of files) {
  if (applied.has(file)) {
    console.log(`  skip  ${file}`)
    continue
  }
  const sql = readFileSync(join(migrationsDir, file), 'utf-8')
  db.exec(sql)
  db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file)
  console.log(`  apply ${file}`)
}

console.log('Migrations complete.')
db.close()
