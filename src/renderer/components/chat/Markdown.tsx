import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children ?? '')
    const lang = /language-([\w+-]+)/.exec(className ?? '')?.[1]
    // Blocos cercados têm classe de linguagem ou quebras de linha; o resto é código inline.
    if (lang || text.includes('\n')) return <CodeBlock code={text.replace(/\n$/, '')} lang={lang} />
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  },
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-blue-500 underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
