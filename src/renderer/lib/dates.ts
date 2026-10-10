/** Datas de tarefas no formato AAAA-MM-DD, sempre no fuso local. */
export function isoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return isoDate(new Date(y, m - 1, d + days))
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export type DueTone = 'overdue' | 'today' | 'soon' | 'later'

/** Rótulo curto e tom de uma data de vencimento, relativo a `today`. */
export function dueLabel(due: string, today: string): { label: string; tone: DueTone } {
  if (due < today) {
    const label = due === addDays(today, -1) ? 'Ontem' : formatShort(due)
    return { label, tone: 'overdue' }
  }
  if (due === today) return { label: 'Hoje', tone: 'today' }
  if (due === addDays(today, 1)) return { label: 'Amanhã', tone: 'soon' }
  if (due <= addDays(today, 6)) {
    const [y, m, d] = due.split('-').map(Number) as [number, number, number]
    return { label: WEEKDAYS[new Date(y, m - 1, d).getDay()]!, tone: 'soon' }
  }
  return { label: formatShort(due), tone: 'later' }
}

function formatShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number) as [number, number, number]
  return `${d} ${MONTHS[m - 1]}`
}
