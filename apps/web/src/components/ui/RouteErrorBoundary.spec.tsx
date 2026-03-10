import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RouteErrorBoundary } from './RouteErrorBoundary';

function renderBoundary(loader: () => unknown) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <div />,
        loader,
        errorElement: <RouteErrorBoundary />,
      },
    ],
    { initialEntries: ['/'] },
  );

  return render(<RouterProvider router={router} />);
}

describe('RouteErrorBoundary', () => {
  it('renders a not-found state for 404 route errors', async () => {
    renderBoundary(() => {
      throw new Response('Missing', { status: 404, statusText: 'Not Found' });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/page not found/i);
    expect(screen.getByText(/requested page could not be found/i)).toBeInTheDocument();
  });

  it('renders the thrown error message for unexpected failures', async () => {
    renderBoundary(() => {
      throw new Error('Analytics failed to load');
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/analytics failed to load/i);
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });
});
