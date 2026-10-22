import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { PinnedMessage } from '@shared/types'

interface Row {
  id: string
  session_id: string
  item_index: number
  text: string
  created_at: number
}

const toPin = (row: Row): PinnedMessage => ({
  id: row.id,
  sessionId: row.session_id,
  itemIndex: row.item_index,
  text: row.text,
  createdAt: row.created_at,
})

/** Mensagens fixadas por conversa (apagadas junto com a conversa). */
export class PinRepo {
  constructor(private readonly db: Database.Database) {}

  list(sessionId: string): PinnedMessage[] {
    return (
      this.db
        .prepare('SELECT * FROM pinned_messages WHERE session_id = ? ORDER BY created_at DESC')
        .all(sessionId) as Row[]
    ).map(toPin)
  }

  /** Fixa (ou atualiza o texto, se a mensagem já estava fixada). */
  add(sessionId: string, itemIndex: number, text: string): PinnedMessage {
    const existing = this.db
      .prepare('SELECT * FROM pinned_messages WHERE session_id = ? AND item_index = ?')
      .get(sessionId, itemIndex) as Row | undefined
    if (existing) {
      this.db.prepare('UPDATE pinned_messages SET text = ? WHERE id = ?').run(text, existing.id)
      return toPin({ ...existing, text })
    }
    const row: Row = {
      id: randomUUID(),
      session_id: sessionId,
      item_index: itemIndex,
      text,
      created_at: Date.now(),
    }
    this.db
      .prepare(
        'INSERT INTO pinned_messages (id, session_id, item_index, text, created_at) VALUES (@id, @session_id, @item_index, @text, @created_at)',
      )
      .run(row)
    return toPin(row)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM pinned_messages WHERE id = ?').run(id)
  }
}
