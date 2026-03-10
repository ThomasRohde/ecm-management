import './styles/sapphire.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { App } from './App';
import { LoginPage } from './pages/LoginPage';
import { CapabilityListPage } from './pages/CapabilityListPage';
import { CapabilityDetailPage } from './pages/CapabilityDetailPage';
import { CapabilityFormPage } from './pages/CapabilityFormPage';
import { CapabilityImportPage } from './pages/CapabilityImportPage';
import { GuardrailReviewQueuePage } from './pages/GuardrailReviewQueuePage';
import { ChangeRequestListPage } from './pages/ChangeRequestListPage';
import { ChangeRequestDetailPage } from './pages/ChangeRequestDetailPage';
import { ChangeRequestFormPage } from './pages/ChangeRequestFormPage';
import { MappingsPage } from './pages/MappingsPage';
import { ReleaseDashboardPage } from './pages/ReleaseDashboardPage';
import { WhatIfManagerPage } from './pages/WhatIfManagerPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AuditTrailPage } from './pages/AuditTrailPage';
import { IntegrationConsumersPage } from './pages/IntegrationConsumersPage';
import { AnalyticsDashboardPage } from './pages/AnalyticsDashboardPage';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { RouteErrorBoundary } from './components/ui/RouteErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/',
    element: <App />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <AnalyticsDashboardPage />,
      },
      {
        path: 'capabilities',
        element: <CapabilityListPage />,
      },
      {
        path: 'capabilities/import',
        element: <CapabilityImportPage />,
      },
      {
        path: 'capabilities/:id',
        element: <CapabilityDetailPage />,
      },
      {
        path: 'capabilities/create',
        element: <CapabilityFormPage />,
      },
      {
        path: 'capabilities/:id/edit',
        element: <CapabilityFormPage />,
      },
      {
        path: 'guardrails/review-queue',
        element: <GuardrailReviewQueuePage />,
      },
      {
        path: 'change-requests',
        element: <ChangeRequestListPage />,
      },
      {
        path: 'change-requests/create',
        element: <ChangeRequestFormPage />,
      },
      {
        path: 'change-requests/:id',
        element: <ChangeRequestDetailPage />,
      },
      {
        path: 'releases',
        element: <ReleaseDashboardPage />,
      },
      {
        path: 'what-if',
        element: <WhatIfManagerPage />,
      },
      {
        path: 'what-if/:branchId',
        element: <WhatIfManagerPage />,
      },
      {
        path: 'mappings',
        element: <MappingsPage />,
      },
      {
        path: 'integration/consumers',
        element: <IntegrationConsumersPage />,
      },
      {
        path: 'notifications',
        element: <NotificationsPage />,
      },
      {
        path: 'audit',
        element: <AuditTrailPage />,
      },
    ],
  },
]);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
