import { $, esc, icon } from './dom.js';

let timer;

// Material snackbar. Errors get the error accent.
export function toast(message, isError = false) {
  const el = $('#snackbar');
  el.className = `snackbar show${isError ? ' error' : ''}`;
  el.innerHTML = `${icon(isError ? 'error' : 'check_circle')}<span>${esc(message)}</span>`;
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), 3000);
}
