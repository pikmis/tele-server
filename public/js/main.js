// Entry point: boot, login/logout, navigation shell and action dispatch.
import { store } from './core/store.js';
import { api, ApiError } from './core/api.js';
import { $, icon } from './core/dom.js';
import { toast } from './core/snackbar.js';
import { initDialog, closeDialog, takePending } from './core/dialog.js';
import * as peers from './views/peers.js';
import * as aliases from './views/aliases.js';
import * as notices from './views/notices.js';
import * as reports from './views/reports.js';
import * as settings from './views/settings.js';

const VIEWS = { peers, aliases, notices, reports, settings };

const TABS = [
  ['peers', 'Аккаунты', 'group'],
  ['aliases', 'Алиасы', 'alternate_email'],
  ['notices', 'Уведомления', 'notifications'],
  ['reports', 'Краши', 'bug_report'],
  ['settings', 'Настройки', 'settings'],
];

// Every data-action in the DOM resolves here. Each view owns its own actions.
const actions = {
  ...Object.assign({}, ...Object.values(VIEWS).map((v) => v.actions)),
  login,
  logout,
  nav: (el) => go(el.dataset.tab),
  'close-dialog': closeDialog,
  'confirm-ok': async () => {
    const fn = takePending();
    closeDialog();
    await fn?.();
  },
};

function renderNav() {
  const counts = {
    peers: store.data.peers.length,
    aliases: store.data.aliases.length,
    notices: store.data.notices.length,
  };
  $('#nav').innerHTML =
    TABS.map(([id, label, iconName]) => `
      <button class="rail-item ${id === store.tab ? 'active' : ''}" data-action="nav" data-tab="${id}">
        <span class="rail-pill">
          ${icon(iconName)}
          ${counts[id] != null ? `<span class="rail-badge">${counts[id]}</span>` : ''}
        </span>
        <span class="label-medium">${label}</span>
      </button>`).join('') + `
      <button class="rail-item logout" data-action="logout">
        <span class="rail-pill">${icon('logout')}</span>
        <span class="label-medium">Выйти</span>
      </button>`;
}

async function render() {
  renderNav();
  const view = VIEWS[store.tab];
  const root = $('#view');
  root.innerHTML = await view.render();
  view.mount?.(root);
}

// Fetch fresh state from the server and redraw the current tab.
async function reload() {
  store.data = await api('/state');
  await render();
}

function go(tab) {
  store.setTab(tab);
  render();
}

function showApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  render();
}

function showLogin() {
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

async function login() {
  store.setToken($('#tok').value.trim());
  try {
    store.data = await api('/state');
    showApp();
  } catch (e) {
    store.setToken('');
    if (e instanceof ApiError && e.status === 401) toast('Неверный токен', true);
  }
}

function logout() {
  store.setToken('');
  store.data = null;
  showLogin();
}

// Single delegated listener for every [data-action] element.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  Promise.resolve(fn(el)).catch((err) => {
    if (!(err instanceof ApiError)) toast(err.message || 'Ошибка', true);
  });
});

store.reload = reload;
store.rerender = render;
store.onUnauthorized = () => {
  if (store.data) {
    logout();
    toast('Сессия истекла, войдите снова', true);
  }
};

initDialog();
$('#tok').addEventListener('keydown', (e) => e.key === 'Enter' && login());

// Restore an existing session if the saved token still works.
if (store.token) {
  api('/state')
    .then((data) => {
      store.data = data;
      showApp();
    })
    .catch(() => {
      store.setToken('');
      showLogin();
    });
}
