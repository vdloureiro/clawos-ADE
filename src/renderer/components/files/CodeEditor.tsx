import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Text } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { loadEditorLanguage } from './editorLanguages'

/** Cores de sintaxe via variáveis CSS (claro/escuro em styles.css, estilo GitHub). */
const highlightStyle = HighlightStyle.define([
  {
    tag: [t.comment, t.lineComment, t.blockComment],
    color: 'var(--cm-comment)',
    fontStyle: 'italic',
  },
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: 'var(--cm-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--cm-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--cm-number)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--cm-function)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--cm-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--cm-property)' },
  { tag: [t.tagName, t.heading], color: 'var(--cm-tag)', fontWeight: '600' },
  { tag: [t.link, t.url], color: 'var(--cm-string)', textDecoration: 'underline' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--cm-comment)' },
  { tag: t.invalid, color: 'var(--cm-invalid)' },
])

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    lineHeight: '1.6',
  },
  '.cm-content': { caretColor: 'var(--foreground)', paddingBlock: '8px' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--muted-foreground)',
  },
  '.cm-lineNumbers .cm-gutterElement': { paddingInline: '12px 10px', opacity: '0.7' },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklab, var(--foreground) 5%, transparent)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--color-blue-500) 28%, transparent) !important',
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in oklab, var(--color-amber-500) 30%, transparent)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    borderColor: 'var(--border)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
  },
})

export interface CodeEditorHandle {
  getText(): string
  /** Troca o conteúdo (ex.: arquivo recarregado do disco) e marca como salvo. */
  replace(text: string): void
  /** O conteúdo atual passa a ser a versão salva. */
  markSaved(): void
}

/**
 * Editor de código (CodeMirror 6) da aba de arquivo. ⌘S salva; avisa o pai quando o
 * texto difere da versão salva.
 */
export const CodeEditor = forwardRef<
  CodeEditorHandle,
  {
    path: string
    initialText: string
    line?: number
    nonce?: number
    onDirtyChange: (dirty: boolean) => void
    onSave: () => void
  }
>(function CodeEditor({ path, initialText, line, nonce, onDirtyChange, onSave }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const saved = useRef<Text | null>(null)
  const dirty = useRef(false)
  const callbacks = useRef({ onDirtyChange, onSave })
  useEffect(() => {
    callbacks.current = { onDirtyChange, onSave }
  })

  // Cria o editor uma vez por arquivo; o conteúdo depois muda por `replace`.
  useEffect(() => {
    if (!host.current) return
    const language = new Compartment()
    const setDirty = (value: boolean) => {
      if (dirty.current === value) return
      dirty.current = value
      callbacks.current.onDirtyChange(value)
    }
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ activateOnTyping: false }),
          highlightActiveLine(),
          highlightSelectionMatches(),
          syntaxHighlighting(highlightStyle),
          theme,
          language.of([]),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                callbacks.current.onSave()
                return true
              },
            },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && saved.current) setDirty(!update.state.doc.eq(saved.current))
          }),
        ],
      }),
    })
    saved.current = editor.state.doc
    view.current = editor
    void loadEditorLanguage(path).then((ext) => {
      if (ext && view.current === editor) editor.dispatch({ effects: language.reconfigure(ext) })
    })
    return () => {
      editor.destroy()
      view.current = null
    }
    // initialText só vale na criação; recargas usam `replace`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  // Vai para a linha citada no chat (ex.: `schema.sql:42`).
  useEffect(() => {
    const editor = view.current
    if (!editor || !line) return
    const target = Math.min(Math.max(1, line), editor.state.doc.lines)
    const { from, to } = editor.state.doc.line(target)
    editor.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    })
  }, [line, nonce])

  useImperativeHandle(ref, () => ({
    getText: () => view.current?.state.doc.toString() ?? '',
    replace: (text) => {
      const editor = view.current
      if (!editor) return
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } })
      saved.current = editor.state.doc
      dirty.current = false
      callbacks.current.onDirtyChange(false)
    },
    markSaved: () => {
      const editor = view.current
      if (!editor) return
      saved.current = editor.state.doc
      dirty.current = false
      callbacks.current.onDirtyChange(false)
    },
  }))

  return <div ref={host} className="h-full min-h-0 select-text" />
})
