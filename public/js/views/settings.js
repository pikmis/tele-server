import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { toast } from '../core/snackbar.js';
import { esc, icon } from '../core/dom.js';
import { pageHead, card, cardHead, textField, switchInput } from '../core/ui.js';

export function render() {
  const { salt, effectiveSalt, autoSalt, argon2: a, etag } = store.data;
  const origin = location.origin;

  return `
    ${pageHead(
      'Настройки',
      'Параметры хеширования и адреса сервера',
      `<button class="btn filled" data-action="settings-save">${icon('save')}<span>Сохранить</span></button>`,
    )}
    ${card(
      `${cardHead('Argon2id', '16 байт, версия 0x13')}
       <div class="card-body stack">
         ${textField({ id: 's-salt', label: 'Salt', value: salt, attrs: autoSalt ? 'disabled' : '', hint: 'base64 с паддингом, 8–64 байт' })}
         <div class="grid-3">
           ${textField({ id: 's-mem', label: 'Memory, KiB', type: 'number', value: a.memory, hint: '1024–65536' })}
           ${textField({ id: 's-pass', label: 'Passes', type: 'number', value: a.passes, hint: '1–8' })}
           ${textField({ id: 's-lanes', label: 'Lanes', type: 'number', value: a.lanes, hint: '1–8' })}
         </div>
         <div class="swrow">${switchInput({ id: 's-auto', checked: autoSalt })}<span>Менять соль автоматически каждый месяц</span></div>
         <p class="body-medium muted">memory × passes не больше 65536. Сейчас отдаётся соль <code>${esc(effectiveSalt)}</code></p>
         <div><button class="btn outlined" data-action="settings-regen">Сгенерировать новую соль</button></div>
       </div>`,
      'outlined',
    )}
    ${card(
      `${cardHead('Эндпоинты', 'Укажите этот адрес в tele: settings → tele → server')}
       <div class="card-body stack">
         <div><div class="label-large muted">Адрес сервера</div><code>${origin}</code></div>
         <div><div class="label-large muted">Список</div><code>GET ${origin}/v1/badges</code></div>
         <div><div class="label-large muted">ETag списка</div><code>${esc(etag)}</code></div>
         <div><div class="label-large muted">Краши</div>
           <div class="stack" style="gap:6px"><code>GET ${origin}/v1/crash.php?act=query_report&amp;…</code><code>POST ${origin}/v1/crash.php?act=report</code></div>
         </div>
       </div>`,
      'outlined',
    )}`;
}

async function save(regenerate) {
  const v = (id) => document.getElementById(id).value;
  await api('/settings', 'POST', {
    salt: v('s-salt'),
    regenerateSalt: regenerate,
    autoSalt: document.getElementById('s-auto').checked,
    argon2: { memory: Number(v('s-mem')), passes: Number(v('s-pass')), lanes: Number(v('s-lanes')) },
  });
  toast(regenerate ? 'Соль сгенерирована' : 'Настройки сохранены');
  await store.reload();
}

export const actions = {
  'settings-save': () => save(false),
  'settings-regen': () => save(true),
};
