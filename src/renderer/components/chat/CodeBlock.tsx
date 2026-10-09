import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { highlight } from '@/lib/highlight'

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    void highlight(code, lang).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [code, lang])

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="group relative my-2 overflow-hidden rounded-md border bg-muted/40">
      <div className="flex items-center justify-between border-b px-3 py-1 text-[11px] text-muted-foreground">
        <span>{lang || 'texto'}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 opacity-60 transition-opacity hover:opacity-100"
          title="Copiar"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {html ? (
        <div
          className="shiki-wrap overflow-x-auto p-3 text-xs"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3 font-mono text-xs">{code}</pre>
      )}
    </div>
  )
}
