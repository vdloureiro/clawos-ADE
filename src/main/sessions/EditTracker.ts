/**
 * Detecta quando sessões que compartilham a mesma pasta editam o mesmo arquivo.
 * Cada combinação (arquivo, par de sessões) gera no máximo um aviso.
 */
export class EditTracker {
  private readonly editors = new Map<string, Set<string>>()
  private readonly warned = new Set<string>()

  /**
   * Registra que `sessionId` editou `file` (caminho absoluto) e retorna as outras
   * sessões que já tinham editado o mesmo arquivo e ainda não foram avisadas.
   */
  record(file: string, sessionId: string): string[] {
    const editors = this.editors.get(file) ?? new Set<string>()
    this.editors.set(file, editors)
    const others: string[] = []
    for (const other of editors) {
      if (other === sessionId) continue
      const key = [file, ...[other, sessionId].sort()].join('\0')
      if (this.warned.has(key)) continue
      this.warned.add(key)
      others.push(other)
    }
    editors.add(sessionId)
    return others
  }

  forget(sessionId: string): void {
    for (const editors of this.editors.values()) editors.delete(sessionId)
  }
}
