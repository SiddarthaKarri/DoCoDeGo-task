import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI exception in ErrorBoundary:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', maxWidth: 600, margin: '2rem auto', textAlign: 'center' }}>
          <div
            style={{
              padding: '1.5rem',
              backgroundColor: '#fef2f2',
              borderRadius: '8px',
              border: '1px solid #f87171',
              color: '#991b1b',
            }}
          >
            <h2 style={{ margin: '0 0 0.5rem' }}>Something went wrong</h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.9rem' }}>
              {this.state.error?.message ??
                'An unexpected error occurred while rendering the page.'}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
