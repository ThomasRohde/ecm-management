import type { MouseEvent } from 'react';

export function SkipLink() {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const mainContent = document.getElementById('ecm-main-content');
    if (!mainContent) {
      return;
    }

    event.preventDefault();
    mainContent.focus();
    mainContent.scrollIntoView({ block: 'start' });
    window.history.replaceState(null, '', '#ecm-main-content');
  }

  return (
    <a className="ecm-skip-link" href="#ecm-main-content" onClick={handleClick}>
      Skip to main content
    </a>
  );
}
