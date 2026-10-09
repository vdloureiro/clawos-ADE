import { join } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { MIGRATIONS } from './migrations'

let db: Database.Database | null = null

/** Banco local em `<userData>/clawos.db`. Nada sai da máquina. */
export function getDb(): Database.Database {
  if (!db) {
    db = openDatabase(join(app.getPath('userData'), 'clawos.db'))
  }
  return db
}

export function openDatabase(file: string): Database.Database {
  const database = new Database(file)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  migrate(database)
  return database
}

/** Aplica migrations pendentes usando `PRAGMA user_version` como versão do schema. */
export function migrate(database: Database.Database): void {
  const current = database.pragma('user_version', { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version++) {
    database.transaction(() => {
      database.exec(MIGRATIONS[version]!)
      database.pragma(`user_version = ${version + 1}`)
    })()
  }
}

export function closeDb(): void {
  db?.close()
  db = null
}
