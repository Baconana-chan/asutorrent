import { Component, ComponentChildren } from "preact";

interface Props {
  children: ComponentChildren;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that catches rendering errors anywhere in the component tree
 * and displays a fallback UI with a retry option.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor() {
    super();
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Log to console for debugging
    console.error("[ErrorBoundary] Caught error:", error);
    if (info.componentStack) {
      console.error("[ErrorBoundary] Component stack:", info.componentStack);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      return (
        <div class="error-screen">
          <div class="error-icon">💥</div>
          <h2>Something went wrong</h2>
          <pre class="error-message">
            {err?.message || "An unexpected rendering error occurred."}
          </pre>
          <div class="error-actions">
            <button class="btn btn-primary" onClick={this.handleRetry}>
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
