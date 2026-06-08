import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional custom fallback. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** Remount the boundary's subtree when this value changes (e.g. route path),
   *  so navigating away from a crashed page clears the error automatically. */
  resetKey?: unknown
}

interface State {
  error: Error | null
}

/**
 * Catches render/lifecycle errors in its subtree and shows a recovery UI
 * instead of a blank white screen. Place one at the app root (last line of
 * defense) and one around the routed page area (so a single page crash doesn't
 * take down the shell, and "Try again" can recover in place).
 *
 * To send these to an error monitor (e.g. Sentry), report from componentDidCatch
 * — see the hook below.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a console trail in all environments; wire a monitor here when added.
    console.error('ErrorBoundary caught:', error, info.componentStack)
    const reporter = (
      window as unknown as { __reportError?: (e: Error, i: ErrorInfo) => void }
    ).__reportError
    reporter?.(error, info)
  }

  componentDidUpdate(prev: Props) {
    // Auto-reset when the resetKey changes (e.g. user navigated to a new route).
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div className="min-h-[60vh] grid place-items-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-neutral-900">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            An unexpected error occurred while rendering this page. You can try
            again, or reload the app.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={this.reset}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
