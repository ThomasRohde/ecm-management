import { useEffect, useRef, type RefObject } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(dialog: HTMLDialogElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    return !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true';
  });
}

function focusInitialElement(dialog: HTMLDialogElement): void {
  const preferredElement = dialog.querySelector<HTMLElement>('[data-autofocus]');
  if (preferredElement && !preferredElement.hasAttribute('disabled')) {
    preferredElement.focus();
    return;
  }

  const focusableElements = getFocusableElements(dialog);
  if (focusableElements[0]) {
    focusableElements[0].focus();
    return;
  }

  dialog.focus();
}

export function useAccessibleDialog(isOpen: boolean): RefObject<HTMLDialogElement | null> {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (!isOpen) {
      if (wasOpenRef.current && dialog.open) {
        dialog.close?.();
      }

      if (wasOpenRef.current) {
        restoreFocusRef.current?.focus();
        restoreFocusRef.current = null;
        wasOpenRef.current = false;
      }

      return;
    }

    wasOpenRef.current = true;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    }

    const focusTimer = window.setTimeout(() => {
      focusInitialElement(dialog);
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      dialog.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return dialogRef;
}
