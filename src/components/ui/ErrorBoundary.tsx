import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      '[ErrorBoundary] Uncaught render error:',
      error,
      info.componentStack
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
            <div className="text-center space-y-4 max-w-md">
              <h1 className="text-2xl font-bold tracking-tight">
                Something went wrong
              </h1>
              <p className="text-sm text-muted-foreground">
                {this.state.error?.message ?? 'An unexpected error occurred.'}
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = '#/';
                    window.location.reload();
                  }}
                  className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Go home
                </button>
              </div>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
