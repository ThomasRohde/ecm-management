import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { getApiErrorMessage } from '../../api/client';
import { StateMessageCard } from './StateMessageCard';

function getRouteErrorMessage(data: unknown, fallbackMessage: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const apiError = data.error;
    if (
      apiError
      && typeof apiError === 'object'
      && 'message' in apiError
      && typeof apiError.message === 'string'
      && apiError.message.trim().length > 0
    ) {
      return apiError.message;
    }
  }

  return getApiErrorMessage(data, fallbackMessage);
}

function getErrorSummary(error: unknown): { title: string; description: string } {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        title: 'Page not found',
        description: 'The requested page could not be found.',
      };
    }

    return {
      title: `Request failed (${error.status})`,
      description: getRouteErrorMessage(error.data, error.statusText || 'The page could not be loaded.'),
    };
  }

  if (error instanceof Error) {
    return {
      title: 'Something went wrong',
      description:
        error.message.trim().length > 0
          ? error.message
          : 'The page could not be loaded.',
    };
  }

  return {
    title: 'Something went wrong',
    description: 'The page could not be loaded.',
  };
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const { title, description } = getErrorSummary(error);

  return (
    <main
      id="ecm-main-content"
      className="sapphire-stack sapphire-stack--gap-lg"
      tabIndex={-1}
    >
      <StateMessageCard
        title={title}
        description={description}
        variant="error"
        role="alert"
        action={
          <div className="sapphire-row sapphire-row--gap-sm">
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => {
                window.location.assign('/capabilities');
              }}
            >
              <span className="sapphire-button__content">Go to capabilities</span>
            </button>
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => {
                window.location.reload();
              }}
            >
              <span className="sapphire-button__content">Reload page</span>
            </button>
          </div>
        }
      />
    </main>
  );
}
