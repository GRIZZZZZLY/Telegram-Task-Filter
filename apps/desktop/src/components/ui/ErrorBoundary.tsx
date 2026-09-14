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
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-tg-bg px-6 text-center">
          <p className="text-3xl">💥</p>
          <p className="text-tg-box font-semibold text-tg-text-bold">Что-то пошло не так</p>
          <p className="max-w-xs text-tg-sm leading-relaxed text-tg-text-sub">
            {this.state.error?.message ?? 'Неизвестная ошибка рендеринга'}
          </p>
          <button
            onClick={this.handleReload}
            className="mt-2 rounded-tg-btn border border-tg-divider px-4 py-1.5 text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over hover:text-tg-text"
          >
            Попробовать снова
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
