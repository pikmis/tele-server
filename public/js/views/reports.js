import { api, downloadFile } from '../core/api.js';
import { store } from '../core/store.js';
import { toast } from '../core/snackbar.js';
import { esc, icon } from '../core/dom.js';
import { pageHead, card, empty, tag, switchInput } from '../core/ui.js';

function rowHtml(r) {
  return `
    <tr>
      <td class="id">${r.id}</td>
      <td class="muted">${new Date(r.time * 1000).toLocaleString('ru')}</td>
      <td>${esc(r.platform)}</td>
      <td class="id">${esc(r.version)}</td>
      <td>
        <div class="tags">${(r.notes || []).map((t) => tag(t, 'warning')).join('')}</div>
        <details class="report">
          <summary>показать отчёт</summary>
          <pre>${esc(r.report)}</pre>
        </details>
      </td>
      <td class="actions-col">
        ${r.dump ? `<button class="icon-btn" title="Скачать дамп" data-action="report-dump" data-id="${r.id}">${icon('download')}</button>` : ''}
        <button class="icon-btn error" title="Удалить" data-action="report-delete" data-id="${r.id}">${icon('delete')}</button>
      </td>
    </tr>`;
}

export async function render() {
  const reports = await api('/reports');
  const table = reports.length
    ? `<div class="table-wrap">
         <table class="data-table">
           <thead><tr><th>#</th><th>Когда</th><th>Платформа</th><th>Версия</th><th>Отчёт</th><th class="actions-col"></th></tr></thead>
           <tbody>${reports.map(rowHtml).join('')}</tbody>
         </table>
       </div>`
    : empty('bug_report', 'Репортов нет', 'Когда клиент отправит краш, он появится здесь');

  return `
    ${pageHead(
      'Краш-репорты',
      'Приходят с клиентов на /v1/crash.php',
      `<div class="toggle-row">
         ${switchInput({ id: 'crashSwitch', checked: store.data.collectCrashes, attrs: 'data-action="crash-toggle"' })}
         <span class="body-medium">Принимать отчёты</span>
       </div>`,
    )}
    ${card(table, 'outlined')}`;
}

export const actions = {
  'crash-toggle': async (el) => {
    await api('/settings', 'POST', { collectCrashes: el.checked, argon2: store.data.argon2 });
    store.data.collectCrashes = el.checked;
    toast(el.checked ? 'Приём отчётов включён' : 'Приём отчётов выключен');
  },
  'report-dump': (el) => downloadFile(`/reports/${el.dataset.id}/dump`, `${el.dataset.id}.zip`),
  'report-delete': async (el) => {
    await api(`/reports/${el.dataset.id}`, 'DELETE');
    await store.reload();
  },
};
