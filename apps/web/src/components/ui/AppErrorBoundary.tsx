import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StateMessageCard } from './StateMessageCard';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled application render error', error, errorInfo);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main
        id="ecm-main-content"
        tabIndex={-1}
        className="sapphire-container sapphire-stack sapphire-stack--gap-xl"
      >
        <header className="sapphire-stack sapphire-stack--gap-xs">
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            ECM Management Platform
          </p>
          <h1 className="sapphire-text sapphire-text--heading-lg">Unexpected application error</h1>
        </header>

        <StateMessageCard
          title="We couldn&apos;t finish rendering this page"
          description="Reload the app to retry the current workflow, or return to the capability browser to continue working from a stable route."
          variant="error"
          role="alert"
          action={(
            <div className="sapphire-row sapphire-row--gap-sm">
              <a href="/capabilities" className="sapphire-button sapphire-button--secondary">
                <span className="sapphire-button__content">Go to capabilities</span>
              </a>
              <button
                type="button"
                className="sapphire-button sapphire-button--primary"
                onClick={this.handleReload}
              >
                <span className="sapphire-button__content">Reload application</span>
              </button>
            </div>
          )}
        />
      </main>
    );
  }
}
