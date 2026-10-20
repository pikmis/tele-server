// Shared app state. Views read `store.data` and call `store.reload()` / `store.rerender()`;
// main.js wires those two up at boot to avoid circular imports.
export const store = {
  token: localStorage.getItem('tele.token') || '',
  tab: localStorage.getItem('tele.tab') || 'peers',
  data: null,
  reload: null,
  rerender: null,
  onUnauthorized: null,

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('tele.token', token);
    else localStorage.removeItem('tele.token');
  },
  setTab(tab) {
    this.tab = tab;
    localStorage.setItem('tele.tab', tab);
  },
};
