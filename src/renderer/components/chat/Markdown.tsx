import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileLink, InlineCode } from '@/components/files/FileLinks'
import { TASKS_BLOCK } from '@/lib/chatTurns'
import { CodeBlock } from './CodeBlock'
import { TaskProposal } from './TaskProposal'

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children ?? '')
    const lang = /language-([\w+-]+)/.exec(className ?? '')?.[1]
    // Tarefas propostas pelo agente (botão "Organizar em tarefas") viram um cartão.
    if (lang === TASKS_BLOCK) return <TaskProposal code={text.trim()} />
    // Blocos cercados têm classe de linguagem ou quebras de linha; o resto é código inline.
    if (lang || text.includes('\n')) return <CodeBlock code={text.replace(/\n$/, '')} lang={lang} />
    // Caminho de arquivo existente vira link para a aba do arquivo.
    return <InlineCode>{children}</InlineCode>
  },
  a: ({ href, children }) =>
    href && !/^(https?|mailto):/i.test(href) && !href.startsWith('#') ? (
      <FileLink
        path={decodeURIComponent(href.replace(/^file:\/\//, ''))}
        className="inline text-blue-500 underline-offset-2"
      >
        {children}
      </FileLink>
    ) : (
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
