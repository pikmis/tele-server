import { store } from './store.js';
import { toast } from './snackbar.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// JSON request to /admin/api. Shows server error text in a snackbar and throws ApiError.
export async function api(path, method = 'GET', body) {
  const res = await fetch(`/admin/api${path}`, {
    method,
    headers: { 'x-admin-token': store.token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    store.onUnauthorized?.();
    throw new ApiError('unauthorized', 401);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json.error || 'Ошибка сервера';
    toast(message, true);
    throw new ApiError(message, res.status);
  }
  return json;
}

// Binary download (crash dumps) with the admin token header.
export async function downloadFile(path, filename) {
  const res = await fetch(`/admin/api${path}`, { headers: { 'x-admin-token': store.token } });
  if (!res.ok) return toast('Не удалось скачать файл', true);
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
