import { Component, type ReactNode } from 'react'
import { RotateCw, TriangleAlert } from 'lucide-react'

// Shows a friendly screen with a reload button instead of a blank page if any screen crashes.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Na Validade: erro na tela', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-rose-100 text-rose-600">
          <TriangleAlert className="h-8 w-8" />
        </div>
        <p className="text-xl font-semibold">Algo deu errado nesta tela</p>
        <p className="text-sm text-stone-600">Seus dados estão salvos. Recarregue a página para continuar.</p>
        <p className="max-w-full break-words rounded-xl bg-stone-100 px-3 py-2 font-mono text-xs text-stone-500">{this.state.error.message}</p>
        <button
          onClick={() => location.reload()}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 font-semibold text-white active:scale-95"
        >
          <RotateCw className="h-5 w-5" /> Recarregar
        </button>
      </div>
    )
  }
}
