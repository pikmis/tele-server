import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { openDialog, closeDialog, ask } from '../core/dialog.js';
import { toast } from '../core/snackbar.js';
import { $, esc, icon } from '../core/dom.js';
import { pageHead, card, stat, empty, tag, textField, selectField } from '../core/ui.js';

const FLAGS = [
  { name: 'checkmark', label: 'Галочка', tone: 'info' },
  { name: 'scam', label: 'Scam', tone: 'error' },
  { name: 'fake', label: 'Fake', tone: 'warning' },
  { name: 'support', label: 'Support', tone: 'success' },
];

// view state survives re-renders within the tab
let query = '';
let scopeFilter = '';

const splitKey = (key) => key.split(/:(.+)/); // "prod:777000" -> ['prod', '777000', '']

function findPeer(key) {
  const [scope, id] = splitKey(key);
  return store.data.peers.find((p) => p.scope === scope && p.id === id);
}

function filtered() {
  const q = query.trim().toLowerCase();
  return store.data.peers.filter(
    (p) => (!scopeFilter || p.scope === scopeFilter) && JSON.stringify(p).toLowerCase().includes(q),
  );
}

function rowHtml(p) {
  const key = `${p.scope}:${p.id}`;
  const flags = FLAGS.filter((f) => p[f.name]).map((f) =>
    tag(f.label, f.tone, f.name === 'checkmark' ? 'check' : ''),
  );
  if (p.icon) flags.push(tag('icon', 'neutral'));
  if (p.supportText) flags.push(tag(`«${p.supportText}»`, 'neutral'));

  return `
    <tr>
      <td>
        <div class="id">${esc(p.id)}</div>
        <div class="row-sub">
          ${tag(p.scope, p.scope === 'prod' ? 'success' : 'warning')}
          ${p.note ? `<span class="muted">${esc(p.note)}</span>` : ''}
        </div>
      </td>
      <td><div class="tags">${flags.join('') || '<span class="muted">—</span>'}</div></td>
      <td class="muted">${esc(p.description) || '—'}</td>
      <td class="actions-col">
        <button class="icon-btn" title="Изменить" data-action="peer-edit" data-key="${esc(key)}">${icon('edit')}</button>
        <button class="icon-btn error" title="Удалить" data-action="peer-delete" data-key="${esc(key)}">${icon('delete')}</button>
      </td>
    </tr>`;
}

function tableHtml() {
  const rows = filtered();
  if (!rows.length) {
    return store.data.peers.length
      ? empty('search_off', 'Ничего не найдено', 'Измените запрос или фильтр')
      : empty('group', 'Пока пусто', 'Добавьте первый аккаунт кнопкой сверху');
  }
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Аккаунт</th><th>Метки</th><th>Описание</th><th class="actions-col"></th></tr></thead>
        <tbody>${rows.map(rowHtml).join('')}</tbody>
      </table>
    </div>`;
}

export function render() {
  const { peers } = store.data;
  const count = (fn) => peers.filter(fn).length;
  const scopeChip = (value, label) =>
    `<button class="chip ${scopeFilter === value ? 'selected' : ''}" data-action="peer-scope" data-value="${value}">${label}</button>`;

  return `
    ${pageHead(
      'Аккаунты',
      'Метки, которые клиент tele показывает в профилях',
      `<button class="btn filled" data-action="peer-new">${icon('add')}<span>Добавить</span></button>`,
    )}
    <div class="stats">
      ${stat('Всего', peers.length)}
      ${stat('С галочкой', count((p) => p.checkmark), 'tone-info')}
      ${stat('Scam / Fake', count((p) => p.scam || p.fake), 'tone-error')}
      ${stat('Support', count((p) => p.support), 'tone-success')}
    </div>
    ${card(
      `<div class="toolbar">
         <label class="search">${icon('search')}<input id="peerQuery" placeholder="Поиск по ID, описанию…" value="${esc(query)}"></label>
         <div class="chips">${scopeChip('', 'Все')}${scopeChip('prod', 'prod')}${scopeChip('test', 'test')}</div>
       </div>
       <div id="peerTable">${tableHtml()}</div>`,
      'outlined',
    )}`;
}

export function mount(root) {
  $('#peerQuery', root).addEventListener('input', (e) => {
    query = e.target.value;
    $('#peerTable', root).innerHTML = tableHtml();
  });
}

function openPeer(key = null) {
  const editing = key !== null;
  const p = editing
    ? findPeer(key)
    : { scope: 'prod', id: '', description: '', icon: '', supportText: '', note: '', checkmark: true };

  openDialog({
    title: editing ? 'Изменить аккаунт' : 'Новый аккаунт',
    wide: true,
    body: `
      <div class="form-section">
        <h3 class="label-large">Аккаунт</h3>
        <div class="grid-2">
          ${textField({ id: 'p-id', label: 'ID', value: p.id, placeholder: '777000', hint: 'Каналы и супергруппы: -100…', attrs: editing ? 'readonly' : '' })}
          ${selectField({ id: 'p-scope', label: 'Scope', options: ['prod', 'test'], value: p.scope, attrs: editing ? 'disabled' : '' })}
        </div>
      </div>
      <div class="form-section">
        <h3 class="label-large">Метки</h3>
        <div class="chips">
          ${FLAGS.map((f) => `
            <label class="chip-flag tone-${f.tone}">
              <input type="checkbox" id="p-${f.name}" ${p[f.name] ? 'checked' : ''}>
              <span class="msym chip-check">check</span>
              <span>${esc(f.label)}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="form-section">
        <h3 class="label-large">Оформление</h3>
        <div class="grid-2">
          ${textField({ id: 'p-desc', label: 'Описание', value: p.description, placeholder: 'official', hint: 'Текст под верификацией в профиле' })}
          ${textField({ id: 'p-icon', label: 'Icon', value: p.icon, placeholder: '5368324170671202286', hint: 'ID кастомного эмодзи' })}
          ${textField({ id: 'p-st', label: 'supportText', value: p.supportText, placeholder: 'tele team', hint: '1–64 символа, только пользователи', attrs: 'maxlength="64"' })}
          ${textField({ id: 'p-note', label: 'Заметка', value: p.note, hint: 'Не публикуется' })}
        </div>
      </div>`,
    actions: `
      <button class="btn text" data-action="close-dialog">Отмена</button>
      <button class="btn filled" data-action="peer-save">Сохранить</button>`,
  });
}

async function savePeer() {
  const body = {
    scope: $('#p-scope').value,
    id: $('#p-id').value.trim(),
    description: $('#p-desc').value,
    icon: $('#p-icon').value.trim(),
    supportText: $('#p-st').value,
    note: $('#p-note').value,
  };
  for (const f of FLAGS) body[f.name] = $(`#p-${f.name}`).checked;

  await api('/peers', 'POST', body);
  closeDialog();
  toast('Сохранено');
  await store.reload();
}

async function removePeer(key) {
  const [scope, id] = splitKey(key);
  await api(`/peers/${scope}/${id}`, 'DELETE');
  toast('Удалено');
  await store.reload();
}

export const actions = {
  'peer-new': () => openPeer(),
  'peer-edit': (el) => openPeer(el.dataset.key),
  'peer-save': savePeer,
  'peer-delete': (el) =>
    ask('Удалить аккаунт?', `${el.dataset.key} будет удалён из списка.`, 'Удалить', () => removePeer(el.dataset.key)),
  'peer-scope': (el) => {
    scopeFilter = el.dataset.value;
    store.rerender();
  },
};
