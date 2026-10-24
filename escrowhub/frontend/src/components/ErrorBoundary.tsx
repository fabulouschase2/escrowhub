import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

// Catches render-time crashes so a broken page shows a recoverable screen
// instead of a white page.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message || 'Unexpected error' };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', err, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="glass-card max-w-md w-full p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-apple-danger/15 flex items-center justify-center">
              <svg className="w-7 h-7 text-apple-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3l9.5 16.5H2.5L12 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
            <p className="text-apple-muted text-sm mb-6">{this.state.message}</p>
            <button
              onClick={() => window.location.assign('/dashboard')}
              className="glass-btn-primary w-full"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
