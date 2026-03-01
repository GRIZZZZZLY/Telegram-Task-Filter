import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Custom fallback — defaults to a full-screen error panel */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack)
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null })
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
          <p className="text-3xl">💥</p>
          <p className="text-sm font-semibold text-foreground">Что-то пошло не так</p>
          <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
            {this.state.error?.message ?? 'Неизвестная ошибка рендеринга'}
          </p>
          <button
            onClick={this.handleReload}
            className="mt-2 rounded-lg border border-border/50 px-4 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Попробовать снова
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
