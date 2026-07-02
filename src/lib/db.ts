import Database from 'better-sqlite3'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

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

  const candidates = [
    join(process.cwd(), 'migrations'),
    join(process.cwd(), 'src', 'migrations'),
  ]
  const migrationsDir = candidates.find(d => existsSync(d))
  if (!migrationsDir) return
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
