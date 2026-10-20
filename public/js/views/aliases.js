import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { toast } from '../core/snackbar.js';
import { $, esc, icon } from '../core/dom.js';
import { pageHead, card, empty } from '../core/ui.js';

// Working copy of the alias table. Reset to null after a successful save.
let draft = null;

function ensureDraft() {
  if (!draft) {
    draft = store.data.aliases.map((a) => ({ alias: a.alias, username: a.username, position: a.position ?? '' }));
  }
  return draft;
}

function tableHtml() {
  if (!draft.length) return empty('alternate_email', 'Алиасов нет', 'Добавьте кнопкой сверху');
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Алиас</th><th>Реальный username</th><th class="pos-col">Position</th><th class="actions-col"></th></tr>
        </thead>
        <tbody>
          ${draft.map((a, i) => `
            <tr>
              <td><input class="cell-input" data-i="${i}" data-f="alias" value="${esc(a.alias)}" placeholder="tele"></td>
              <td><input class="cell-input" data-i="${i}" data-f="username" value="${esc(a.username)}" placeholder="teleAppUpdates"></td>
              <td class="pos-col"><input class="cell-input" type="number" min="0" max="1000" data-i="${i}" data-f="position" value="${esc(a.position)}" placeholder="—"></td>
              <td class="actions-col"><button class="icon-btn error" title="Удалить" data-action="alias-remove" data-i="${i}">${icon('delete')}</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

export function render() {
  ensureDraft();
  return `
    ${pageHead(
      'Алиасы username',
      'Дополнительные @username, которые tele подменяет на реальные аккаунты',
      `<button class="btn tonal" data-action="alias-add">${icon('add')}<span>Алиас</span></button>
       <button class="btn filled" data-action="alias-save">${icon('save')}<span>Сохранить</span></button>`,
    )}
    ${card(
      `<p class="note body-medium">Alias: 2–32 символа. Username: реальный аккаунт, 4–32 (латиница, цифры, _, с буквы). Position — место среди username аккаунта, 0 — основной. Работает только на main-серверах.</p>
       <div id="aliasTable">${tableHtml()}</div>`,
      'outlined',
    )}`;
}

// Keep typed values in the draft, so re-rendering after add/remove doesn't lose them.
export function mount(root) {
  $('#aliasTable', root).addEventListener('input', (e) => {
    const { i, f } = e.target.dataset;
    if (draft[i]) draft[i][f] = e.target.value;
  });
}

export const actions = {
  'alias-add': () => {
    ensureDraft().push({ alias: '', username: '', position: '' });
    store.rerender();
  },
  'alias-remove': (el) => {
    draft.splice(Number(el.dataset.i), 1);
    store.rerender();
  },
  'alias-save': async () => {
    await api('/aliases', 'PUT', { aliases: draft });
    draft = null;
    toast('Алиасы сохранены');
    await store.reload();
  },
};
