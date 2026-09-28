import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type FallbackRender = (props: { error?: Error; reset: () => void }) => ReactNode;

interface Props {
  children: ReactNode;
  fallback?: ReactNode | FallbackRender;
  // A change clears a caught error, so leaving a page that crashed recovers. It never
  // remounts a page that did not crash.
  resetKey?: unknown;
  // For the last-resort boundary above the Router: while it shows its fallback the Router is
  // unmounted and ignores history changes, so browser Back or Forward clears the error here.
  resetOnHistoryChange?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  private listeningToHistory = false;

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Log to console for debugging
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  public componentDidMount() {
    this.syncHistoryListener();
  }

  public componentDidUpdate(prevProps: Props, prevState: State) {
    // Only an error that was already showing: navigating to a page that crashes keeps it.
    if (prevState.hasError && this.state.hasError && !Object.is(prevProps.resetKey, this.props.resetKey)) {
      this.handleReset();
      return;
    }
    this.syncHistoryListener();
  }

  public componentWillUnmount() {
    if (this.listeningToHistory) {
      window.removeEventListener('popstate', this.handleReset);
      this.listeningToHistory = false;
    }
  }

  private syncHistoryListener() {
    const shouldListen = Boolean(this.props.resetOnHistoryChange && this.state.hasError);
    if (shouldListen === this.listeningToHistory || typeof window === 'undefined') return;
    if (shouldListen) {
      window.addEventListener('popstate', this.handleReset);
    } else {
      window.removeEventListener('popstate', this.handleReset);
    }
    this.listeningToHistory = shouldListen;
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  private handleBack = () => {
    window.history.back();
  };

  public render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback({ error: this.state.error, reset: this.handleReset });
      }
      if (fallback) {
        return fallback;
      }

      // The Router may be unmounted here, so the links are plain anchors, not router Links.
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2">
                <Button onClick={this.handleReset} variant="outline" className="w-full">
                  Try Again
                </Button>
                <Button onClick={this.handleRefresh} className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Page
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={this.handleBack} variant="ghost">
                    Go back
                  </Button>
                  <Button asChild variant="ghost">
                    <a href="/">Go to home</a>
                  </Button>
                </div>
              </div>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 p-3 bg-muted rounded text-xs">
                  <summary className="cursor-pointer font-medium">Error Details</summary>
                  <pre className="mt-2 overflow-auto">
                    {this.state.error.message}
                    {'\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
