import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DATABASE_PATH || 'itsasecret.db'

const rawDb = new Database(dbPath)
rawDb.pragma('journal_mode = WAL')
rawDb.pragma('foreign_keys = ON')

applyMigrations(rawDb)

function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const migrationsDir = join(__dirname, '..', 'migrations')
  let files: string[]
  try {
    files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  } catch {
    return
  }

  const applied = new Set(
    db.prepare('SELECT filename FROM _migrations').all().map((r: any) => r.filename)
  )

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    db.exec(sql)
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file)
  }
}

class BoundStmt {
  constructor(
    private stmt: Database.Statement,
    private params: unknown[]
  ) {}

  async first<T>(): Promise<T | null> {
    const row = this.stmt.get(...this.params) as T | undefined
    return row ?? null
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.stmt.all(...this.params) as T[] }
  }

  async run(): Promise<void> {
    this.stmt.run(...this.params)
  }
}

class Stmt {
  constructor(private stmt: Database.Statement) {}

  bind(...args: unknown[]): BoundStmt {
    return new BoundStmt(this.stmt, args)
  }
}

export const db = {
  prepare(sql: string): Stmt {
    return new Stmt(rawDb.prepare(sql))
  },
}
