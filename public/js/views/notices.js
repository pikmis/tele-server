import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { toast } from '../core/snackbar.js';
import { openDialog, closeDialog, ask } from '../core/dialog.js';
import { $, esc, icon, fmtDate, readFile, splitList, toUnix, toLocalInput } from '../core/dom.js';
import { pageHead, card, empty, tag, textField, textArea, selectField, switchInput } from '../core/ui.js';

const TYPES = ['info', 'success', 'warning', 'critical'];

// id of the notice being edited, or null for a new one
let editId = null;

const val = (id) => document.getElementById(id).value;
const checked = (id) => document.getElementById(id).checked;

// "prod:777000" -> { scope, id }; a bare id means prod
function parseUser(s) {
  const [scope, ...rest] = s.split(':');
  return rest.length ? { scope, id: rest.join(':') } : { scope: 'prod', id: scope };
}

function metaLabels(n) {
  const m = [];
  if (n.toast) m.push('toast');
  if (n.photo) m.push('картинка');
  if (n.buttons?.length) m.push(`кнопок: ${n.buttons.length}`);
  if (n.platforms?.length) m.push(n.platforms.join(', '));
  if (n.builds && (n.builds.min != null || n.builds.max != null)) {
    m.push(`build ${n.builds.min ?? '…'}–${n.builds.max ?? '…'}`);
  }
  if (n.users?.length) m.push(`польз.: ${n.users.length}`);
  if (n.from) m.push(`с ${fmtDate(n.from)}`);
  if (n.until) m.push(`до ${fmtDate(n.until)}`);
  return m;
}

function noticeHtml(n) {
  return `
    <article class="notice tone-${n.type} ${n.enabled === false ? 'is-off' : ''}">
      <div class="notice-body">
        <h3 class="title-medium">${esc(n.title) || '<span class="muted">без заголовка</span>'}</h3>
        <p class="body-medium muted clamp">${esc(n.text)}</p>
        <div class="tags">
          ${tag(n.type, n.type)}
          ${tag(`${n.id} · rev ${n.rev}`)}
          ${metaLabels(n).map((x) => tag(x)).join('')}
        </div>
      </div>
      <div class="notice-actions">
        ${switchInput({ checked: n.enabled !== false, attrs: `data-action="notice-toggle" data-id="${esc(n.id)}" title="Вкл/выкл"` })}
        <button class="icon-btn" title="Изменить" data-action="notice-edit" data-id="${esc(n.id)}">${icon('edit')}</button>
        <button class="icon-btn error" title="Удалить" data-action="notice-delete" data-id="${esc(n.id)}">${icon('delete')}</button>
      </div>
    </article>`;
}

export function render() {
  const list = store.data.notices;
  return `
    ${pageHead(
      'Уведомления',
      'Показываются в центре уведомлений tele. Toast — разовое всплывающее окно',
      `<button class="btn filled" data-action="notice-new">${icon('add')}<span>Создать</span></button>`,
    )}
    ${card(
      list.length ? list.map(noticeHtml).join('') : empty('notifications', 'Уведомлений нет', 'Создайте первое кнопкой сверху'),
      'outlined',
    )}`;
}

function formHtml(n, editing) {
  return `
    <div class="form-section">
      <h3 class="label-large">Содержимое</h3>
      <div class="grid-3 align-end">
        ${textField({ id: 'n-id', label: 'ID', value: n.id, placeholder: 'tele-14', hint: 'латиница, цифры, дефисы', attrs: editing ? 'readonly' : '' })}
        ${selectField({ id: 'n-type', label: 'Тип', options: TYPES, value: n.type })}
        <div class="swrow">${switchInput({ id: 'n-toast', checked: n.toast })}<span>Toast (разово)</span></div>
      </div>
      <div class="stack" style="margin-top:8px">
        ${textField({ id: 'n-title', label: 'Заголовок', value: n.title })}
        ${textArea({ id: 'n-text', label: 'Текст', value: n.text, hint: 'до 4096 символов' })}
      </div>
      <div class="grid-2 align-end" style="margin-top:16px">
        <label class="file-field">
          <span class="label-large">Картинка</span>
          <input type="file" id="n-photo" accept="image/png,image/jpeg">
          <span class="tf-hint">jpeg/png до 1 МБ</span>
        </label>
        ${n.photo ? `<div class="swrow">${switchInput({ id: 'n-rm' })}<span>Убрать текущую картинку</span></div>` : ''}
      </div>
    </div>

    <div class="form-section">
      <h3 class="label-large">Кнопки и форматирование</h3>
      <div class="stack">
        ${textField({ id: 'n-btn', label: 'Кнопки (JSON, до 2)', value: JSON.stringify(n.buttons || []), placeholder: '[{"text":"release notes","url":"https://…"}]', hint: 'url: http://, https:// или tg://' })}
        ${textField({ id: 'n-ent', label: 'Entities (JSON, как в bot api)', value: JSON.stringify(n.entities || []), hint: 'offset и length в UTF-16' })}
      </div>
    </div>

    <div class="form-section">
      <h3 class="label-large">Кому показывать</h3>
      <div class="grid-4">
        ${textField({ id: 'n-bmin', label: 'Build от', type: 'number', value: n.builds?.min ?? '' })}
        ${textField({ id: 'n-bmax', label: 'Build до', type: 'number', value: n.builds?.max ?? '' })}
        <div class="span-2">${textField({ id: 'n-plat', label: 'Платформы', value: (n.platforms || []).join(', '), placeholder: 'windows, linux, macos' })}</div>
      </div>
      <div class="stack" style="margin-top:8px">
        ${textField({ id: 'n-users', label: 'Пользователи', value: (n.users || []).map((u) => `${u.scope}:${u.id}`).join(', '), placeholder: 'prod:777000, test:12345', hint: 'Пусто — всем. Хранится в виде хешей.' })}
      </div>
      <div class="grid-2" style="margin-top:8px">
        ${textField({ id: 'n-from', label: 'Показывать с', type: 'datetime-local', value: toLocalInput(n.from) })}
        ${textField({ id: 'n-until', label: 'До', type: 'datetime-local', value: toLocalInput(n.until) })}
      </div>
    </div>`;
}

function openNotice(id = null) {
  editId = id;
  const editing = id !== null;
  const n = editing
    ? store.data.notices.find((x) => x.id === id)
    : { type: 'info', toast: false, builds: {}, platforms: [], users: [], entities: [], buttons: [] };

  openDialog({
    title: editing ? `Изменить · ${id}` : 'Новое уведомление',
    wide: true,
    body: formHtml(n, editing),
    actions: `
      <button class="btn text" data-action="close-dialog">Отмена</button>
      <button class="btn filled" data-action="notice-save">${editing ? 'Сохранить (rev +1)' : 'Опубликовать'}</button>`,
  });
}

async function saveNotice() {
  let entities;
  let buttons;
  try {
    entities = JSON.parse(val('n-ent') || '[]');
    buttons = JSON.parse(val('n-btn') || '[]');
  } catch {
    return toast('Кнопки или entities: неверный JSON', true);
  }

  const old = editId !== null ? store.data.notices.find((x) => x.id === editId) : null;
  const body = {
    id: val('n-id').trim(),
    type: val('n-type'),
    title: val('n-title'),
    text: val('n-text'),
    toast: checked('n-toast'),
    enabled: old ? old.enabled !== false : true,
    entities,
    buttons,
    builds: { min: val('n-bmin'), max: val('n-bmax') },
    platforms: splitList(val('n-plat').toLowerCase()),
    from: toUnix(val('n-from')),
    until: toUnix(val('n-until')),
    users: splitList(val('n-users')).map(parseUser),
  };
  if (old) body.rev = old.rev;

  const file = document.getElementById('n-photo').files[0];
  if (file) body.photoData = await readFile(file);
  if (document.getElementById('n-rm')?.checked) body.removePhoto = true;

  await api('/notices', 'POST', body);
  editId = null;
  closeDialog();
  toast('Сохранено');
  await store.reload();
}

// Enable/disable without bumping rev, so clients don't show it again as an update.
async function toggleNotice(el) {
  const n = store.data.notices.find((x) => x.id === el.dataset.id);
  await api('/notices', 'POST', { ...n, enabled: el.checked, bump: false });
  toast(el.checked ? 'Уведомление включено' : 'Уведомление выключено');
  await store.reload();
}

async function removeNotice(id) {
  await api(`/notices/${id}`, 'DELETE');
  toast('Удалено');
  await store.reload();
}

export const actions = {
  'notice-new': () => openNotice(),
  'notice-edit': (el) => openNotice(el.dataset.id),
  'notice-save': saveNotice,
  'notice-toggle': toggleNotice,
  'notice-delete': (el) =>
    ask('Удалить уведомление?', `Уведомление ${el.dataset.id} пропадёт у всех клиентов.`, 'Удалить', () => removeNotice(el.dataset.id)),
};
