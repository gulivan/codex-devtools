import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createLogger } from '@shared/utils/logger';

const logger = createLogger('Renderer:ErrorBoundary');

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('Renderer error boundary captured an error', error, errorInfo);
  }

  private reset = (): void => {
    this.setState({ hasError: false, errorMessage: null });
  };

  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="empty-view">
          <p className="empty-title">Renderer crashed</p>
          <p className="empty-copy">{this.state.errorMessage ?? 'Unexpected error'}</p>
          <div className="error-actions">
            <button type="button" className="tabbar-action" onClick={this.reset}>
              Try Again
            </button>
            <button type="button" className="tabbar-action" onClick={this.reload}>
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
