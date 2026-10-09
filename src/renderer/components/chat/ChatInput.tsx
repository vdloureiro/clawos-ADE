import { useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ChatInput({
  disabled,
  working,
  onSend,
  onStop,
}: {
  disabled: boolean
  working: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  const send = () => {
    const value = text.trim()
    if (!value || disabled || working) return
    onSend(value)
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia; Shift+Enter quebra linha; não envia durante composição (IME/acentos).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="border-t p-3">
      <div className="flex items-end gap-2 rounded-lg border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            disabled ? 'Conectando ao agente…' : 'Peça algo ao agente (Shift+Enter quebra linha)'
          }
          rows={1}
          className="field-sizing-content max-h-48 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground select-text"
        />
        {working ? (
          <Button size="icon" variant="secondary" className="size-7" onClick={onStop} title="Parar">
            <Square className="size-3 fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="size-7"
            onClick={send}
            disabled={disabled || !text.trim()}
            title="Enviar"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
