import '@testing-library/jest-dom';

// JSDOM does not implement HTMLDialogElement.showModal/close fully,
// so dialog content stays inaccessible to accessibility queries.
// Polyfill both methods so tests can render open dialogs.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close(returnValue?: string) {
  this.removeAttribute('open');
  if (returnValue !== undefined) {
    this.returnValue = returnValue;
  }
};
