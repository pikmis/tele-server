import { $, esc, icon } from './dom.js';

// Material dialog built on the native <dialog>. Buttons inside use data-action,
// which main.js dispatches (close-dialog, confirm-ok, and view actions).
export function openDialog({ title, body, actions = '', wide = false, onOpen }) {
  const dlg = $('#dlg');
  dlg.className = `dialog${wide ? ' dialog-wide' : ''}`;
  dlg.innerHTML = `
    <div class="dialog-head">
      <h2 class="headline-small">${esc(title)}</h2>
      <button class="icon-btn" title="Закрыть" data-action="close-dialog">${icon('close')}</button>
    </div>
    <div class="dialog-body">${body}</div>
    <div class="dialog-actions">${actions}</div>`;
  dlg.showModal();
  onOpen?.(dlg);
}

export const closeDialog = () => $('#dlg').close();

// Click on the backdrop closes the dialog.
export function initDialog() {
  const dlg = $('#dlg');
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeDialog();
  });
}

// Confirmation dialog. `fn` runs when the user presses the OK button (confirm-ok action).
let pending = null;

export function ask(title, text, okLabel, fn) {
  pending = fn;
  openDialog({
    title,
    body: `<p class="body-large">${esc(text)}</p>`,
    actions: `
      <button class="btn text" data-action="close-dialog">Отмена</button>
      <button class="btn danger" data-action="confirm-ok">${esc(okLabel)}</button>`,
  });
}

export function takePending() {
  const fn = pending;
  pending = null;
  return fn;
}
