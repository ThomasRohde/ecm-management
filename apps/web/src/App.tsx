import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { UserRole } from '@ecm/shared';
import { AuthBanner } from './components/ui/AuthBanner';
import { SkipLink } from './components/ui/SkipLink';
import { useAuth } from './contexts/AuthContext';

const baseNavItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/capabilities', label: 'Capabilities' },
  { to: '/mappings', label: 'Mappings' },
  { to: '/change-requests', label: 'Change requests' },
  { to: '/guardrails/review-queue', label: 'Guardrail reviews' },
  { to: '/releases', label: 'Releases' },
  { to: '/what-if', label: 'What-if branches' },
];

export function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const navItems = [...baseNavItems];

  if (user?.role === UserRole.CURATOR || user?.role === UserRole.ADMIN) {
    navItems.splice(2, 0, { to: '/capabilities/import', label: 'Capability import' });
  }

  if (isAuthenticated) {
    navItems.push({ to: '/notifications', label: 'Notifications' });
  }

  if (
    user?.role === UserRole.INTEGRATION_ENGINEER ||
    user?.role === UserRole.ADMIN
  ) {
    navItems.push({ to: '/integration/consumers', label: 'Downstream consumers' });
  }

  if (user?.role === UserRole.ADMIN) {
    navItems.push({ to: '/audit', label: 'Audit trail' });
  }

  function closeSidebar() {
    setIsSidebarOpen(false);
  }

  return (
    <div className={`ecm-layout${isSidebarOpen ? ' ecm-layout--sidebar-open' : ''}`}>
      <SkipLink />
      <button
        type="button"
        className="ecm-layout__scrim"
        aria-label="Close navigation overlay"
        onClick={closeSidebar}
      />

      <aside className="ecm-sidebar" id="ecm-primary-navigation">
        <div className="ecm-sidebar__header">
          <h1 className="ecm-sidebar__title">ECM Platform</h1>
          <button
            type="button"
            className="ecm-sidebar__close"
            aria-label="Close navigation"
            onClick={closeSidebar}
          >
            Close
          </button>
        </div>

        <nav aria-label="Primary navigation">
          <ul className="ecm-sidebar__nav">
            {navItems.map((item) => (
              <li key={item.to} className="ecm-sidebar__nav-item">
                <Link
                  to={item.to}
                  className="ecm-sidebar__nav-link"
                  onClick={closeSidebar}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="ecm-main" id="ecm-main-content" tabIndex={-1}>
        <AuthBanner />
        <div className="ecm-layout__mobileBar">
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            aria-controls="ecm-primary-navigation"
            aria-expanded={isSidebarOpen}
            onClick={() => {
              setIsSidebarOpen((currentValue) => !currentValue);
            }}
          >
            <span className="sapphire-button__content">
              {isSidebarOpen ? 'Close navigation' : 'Open navigation'}
            </span>
          </button>

          <span className="ecm-layout__mobileTitle">ECM Platform</span>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
