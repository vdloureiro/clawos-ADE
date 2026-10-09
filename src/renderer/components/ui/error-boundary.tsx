import { Component, type ReactNode } from 'react'
import { Button } from './button'

/** Isola falhas de renderização: um painel com erro não derruba o app inteiro. */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <p className="font-medium">{this.props.label ?? 'Algo deu errado nesta área.'}</p>
        <pre className="max-w-lg overflow-auto rounded bg-muted p-2 text-left font-mono text-xs whitespace-pre-wrap select-text">
          {this.state.error.message}
        </pre>
        <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
          Tentar de novo
        </Button>
      </div>
    )
  }
}
