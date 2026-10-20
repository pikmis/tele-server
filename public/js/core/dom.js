// Small DOM and formatting helpers. No framework: views render HTML strings.

export const $ = (selector, root = document) => root.querySelector(selector);

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const icon = (name, cls = '') => `<span class="msym ${cls}" aria-hidden="true">${name}</span>`;

// unix seconds -> value for <input type="datetime-local"> (local time)
export const toLocalInput = (ts) =>
  ts ? new Date(ts * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

// <input type="datetime-local"> value -> unix seconds (undefined when empty)
export const toUnix = (value) => (value ? Math.floor(new Date(value) / 1000) : undefined);

export const fmtDate = (ts) =>
  new Date(ts * 1000).toLocaleString('ru', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// "a, b ,c" -> ['a', 'b', 'c']
export const splitList = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);

export const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
