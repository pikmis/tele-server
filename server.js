// tele-compatible server (docs/server.md) + admin panel. Zero dependencies, Node >= 24.7 (crypto.argon2Sync).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DUMP_DIR = path.join(DATA_DIR, 'dumps');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
for (const d of [DUMP_DIR, PHOTO_DIR]) fs.mkdirSync(d, { recursive: true });

const L = { list: 4 * 1024 * 1024, peers: 100000, notices: 64, text: 4096, entities: 256, dump: 20 * 1024 * 1024, photo: 1024 * 1024, aliases: 1000 };

// ---------- storage ----------
const b64 = (b) => Buffer.from(b).toString('base64');
const b64url = (b) => b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function loadDb() {
  let db = {};
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
  db.salt ||= b64(crypto.randomBytes(16));
  db.autoSalt ??= false;                         // derive a new salt every month (like the official server)
  db.saltSecret ||= crypto.randomBytes(32).toString('hex');
  db.argon2 ||= { memory: 8192, passes: 1, lanes: 1 };
  db.adminToken ||= crypto.randomBytes(18).toString('base64url');
  db.collectCrashes ??= true;
  db.peers ||= [];     // {id, scope, checkmark, scam, fake, support, supportText, icon, description, note}
  db.aliases ||= [];   // {alias, username, position?}
  db.notices ||= [];
  db.reports ||= [];
  db.nextReport ||= 1;
  for (const n of db.notices) {                  // migrate notices from the first version (numeric id, "revision")
    n.id = String(n.id); n.rev = n.rev ?? Math.max(0, (n.revision || 1) - 1); delete n.revision;
    n.entities ||= []; n.buttons ||= []; n.platforms ||= []; n.users ||= []; n.builds ||= { min: null, max: null };
  }
  return db;
}
let cache = null;
const db = loadDb();
if (process.env.ADMIN_TOKEN) db.adminToken = process.env.ADMIN_TOKEN;
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
  cache = null;
}
save();

// ---------- badges list ----------
const monthKey = () => new Date().toISOString().slice(0, 7);
const currentSalt = () => db.autoSalt
  ? b64(crypto.createHmac('sha256', db.saltSecret).update('salt:' + monthKey()).digest().subarray(0, 16))
  : db.salt;

function keyFor(scope, id, salt) {
  const { memory, passes, lanes } = db.argon2;
  return b64url(crypto.argon2Sync('argon2id', {
    message: Buffer.from(`${scope}:${id}`), nonce: Buffer.from(salt, 'base64'),
    memory, passes, parallelism: lanes, tagLength: 16,
  }));
}

function buildList() {
  const salt = currentSalt();
  if (cache && cache.salt === salt) return cache;
  const entries = db.peers.map(p => {
    const e = {};
    if (p.checkmark) e.checkmark = true;
    if (p.scam) e.scam = true;
    if (p.fake) e.fake = true;
    if (p.support) e.support = true;
    if (p.icon) e.icon = String(p.icon);
    if (p.description) e.description = p.description;
    if (p.supportText) e.supportText = p.supportText;
    return [keyFor(p.scope, p.id, salt), e];
  }).sort((a, b) => (a[0] < b[0] ? -1 : 1));          // sorted: order reveals nothing
  const out = { salt, argon2: db.argon2, peers: Object.fromEntries(entries) };

  const names = {};
  for (const a of db.aliases.slice(0, L.aliases)) {
    const e = { username: a.username };
    if (Number.isInteger(a.position)) e.position = a.position;
    names[a.alias] = e;
  }
  if (Object.keys(names).length) out.usernames = names;

  const now = Date.now() / 1000;
  const notices = db.notices.filter(n => n.enabled !== false).map(n => {
    const o = { id: n.id, rev: n.rev, type: n.type, title: n.title, text: n.text };
    if (n.entities?.length) o.entities = n.entities;
    if (n.photo) o.photo = { url: `/v1/notices/${n.id}/photo?rev=${n.rev}`, width: n.photo.width, height: n.photo.height };
    if (n.buttons?.length) o.buttons = n.buttons;
    if (n.toast) o.toast = true;
    if (n.builds && (n.builds.min != null || n.builds.max != null)) o.builds = { min: n.builds.min ?? null, max: n.builds.max ?? null };
    if (n.platforms?.length) o.platforms = n.platforms;
    if (n.users?.length) o.users = n.users.map(u => keyFor(u.scope, u.id, salt)).sort();
    if (n.from) o.from = n.from;
    if (n.until) o.until = n.until;
    return o;
  }).slice(0, L.notices);
  if (notices.length) out.notices = notices;

  const body = JSON.stringify(out);
  cache = { salt, body, etag: '"' + crypto.createHash('sha256').update(body).digest('hex') + '"' };
  return cache;
}

// ---------- validation ----------
const NAME_RE = (lo, hi) => new RegExp(`^[A-Za-z][A-Za-z0-9_]{${lo - 1},${hi - 1}}$`);
const ALIAS_RE = NAME_RE(2, 32), USER_RE = NAME_RE(4, 32);

function validateAliases(list) {
  if (!Array.isArray(list)) throw new Error('aliases must be an array');
  if (list.length > L.aliases) throw new Error('max 1000 aliases');
  const seen = new Set(), out = [];
  for (const a of list) {
    const alias = String(a.alias || '').trim(), username = String(a.username || '').trim();
    if (!ALIAS_RE.test(alias)) throw new Error(`bad alias "${alias}" (2-32, latin/digits/_, starts with a letter)`);
    if (!USER_RE.test(username)) throw new Error(`bad username "${username}" (4-32, latin/digits/_, starts with a letter)`);
    if (alias.toLowerCase() === username.toLowerCase()) throw new Error(`alias "${alias}" equals its account username`);
    if (seen.has(alias.toLowerCase())) throw new Error(`duplicate alias "${alias}"`);
    seen.add(alias.toLowerCase());
    const e = { alias, username };
    if (a.position !== '' && a.position != null) {
      const pos = +a.position;
      if (!Number.isInteger(pos) || pos < 0 || pos > 1000) throw new Error('position must be a whole number 0-1000');
      e.position = pos;
    }
    out.push(e);
  }
  return out;
}

function validateNotice(n) {
  const err = (m) => { throw new Error(m); };
  if (!/^[A-Za-z0-9-]{1,64}$/.test(n.id || '')) err('id: 1-64 latin letters, digits, dashes');
  if (!['info', 'success', 'warning', 'critical'].includes(n.type)) err('type: info/success/warning/critical');
  n.title = String(n.title || ''); n.text = String(n.text || '');
  if (!n.title && !n.text) err('title or text must not be empty');
  if (n.text.length > L.text) err('text max 4096 chars');
  n.entities = n.entities || [];
  if (!Array.isArray(n.entities) || n.entities.length > L.entities) err('entities: array up to 256');
  n.buttons = n.buttons || [];
  if (!Array.isArray(n.buttons) || n.buttons.length > 2) err('buttons: at most 2');
  for (const b of n.buttons) if (!b.text || !/^(https?|tg):\/\//.test(b.url || '')) err('button needs text and url starting with http://, https:// or tg://');
  n.platforms = (n.platforms || []);
  if (n.platforms.some(p => !['windows', 'linux', 'macos'].includes(p))) err('platforms: windows, linux, macos');
  const bi = (v) => v == null || v === '' ? null : (Number.isInteger(+v) ? +v : err('builds must be whole numbers'));
  n.builds = { min: bi(n.builds?.min), max: bi(n.builds?.max) };
  n.users = (n.users || []).map(u => ({ scope: u.scope === 'test' ? 'test' : 'prod', id: String(u.id) }));
  if (n.users.some(u => !/^-?\d+$/.test(u.id))) err('users: numeric ids');
  for (const k of ['from', 'until']) n[k] = n[k] ? Math.floor(+n[k]) : undefined;
  n.toast = !!n.toast; n.enabled = n.enabled !== false;
}

function validatePeer(b) {
  const scope = b.scope === 'test' ? 'test' : 'prod';
  const id = String(b.id || '').trim();
  if (!/^-?\d+$/.test(id)) throw new Error('id must be numeric (channels/supergroups: -100<id>)');
  const isChannel = id.startsWith('-100');
  if (id.startsWith('-') && !isChannel) throw new Error('basic groups can\'t have entries');
  const p = { id, scope, checkmark: !!b.checkmark, scam: !!b.scam, fake: !!b.fake, support: !!b.support,
    icon: String(b.icon || '').trim(), description: String(b.description || ''), supportText: String(b.supportText || ''), note: String(b.note || '') };
  if (p.icon && !/^\d+$/.test(p.icon)) throw new Error('icon must be a decimal custom emoji document id');
  if (p.supportText) {
    if (isChannel) throw new Error('supportText is for users only');
    if (p.supportText.length > 64) throw new Error('supportText: 1-64 characters');
  }
  return p;
}

// ---------- helpers ----------
const send = (res, code, body, headers = {}) => {
  const isStr = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(code, { 'content-type': isStr ? 'text/plain; charset=utf-8' : 'application/json', ...headers });
  res.end(isStr ? body : JSON.stringify(body));
};
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJson = async (req, max = 3 << 20) => {
  const raw = await readBody(req, max);
  try { return JSON.parse(raw.toString() || '{}'); } catch { throw Object.assign(new Error('bad json'), { code: 400 }); }
};
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return {};
  const delim = Buffer.from('--' + (m[1] || m[2]));
  const fields = {};
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    const start = pos + delim.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    const next = buf.indexOf(delim, start);
    if (next === -1) break;
    const part = buf.slice(start + 2, next - 2);
    const sep = part.indexOf('\r\n\r\n');
    if (sep !== -1) {
      const head = part.slice(0, sep).toString();
      const name = /name="([^"]*)"/.exec(head)?.[1];
      if (name) fields[name] = /filename=/.test(head) ? part.slice(sep + 4) : part.slice(sep + 4).toString();
    }
    pos = next;
  }
  return fields;
}
const authed = (req) => {
  const t = Buffer.from(req.headers['x-admin-token'] || ''), a = Buffer.from(db.adminToken);
  return t.length === a.length && crypto.timingSafeEqual(t, a);
};
function imageInfo(buf) {          // jpeg or png -> {ext,width,height}
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { ext: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const mk = buf[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { ext: 'jpg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}
const photoFile = (id, rev, ext) => path.join(PHOTO_DIR, `${id}-${rev}.${ext}`);
const rmPhoto = (n) => { if (n?.photo) fs.rmSync(photoFile(n.id, n.photo.rev, n.photo.ext), { force: true }); };

// ---------- admin API ----------
async function admin(req, res, url) {
  if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
  const p = url.pathname.replace('/admin/api', ''), m = req.method;
  let mm;
  try {
    if (p === '/state' && m === 'GET') {
      const c = buildList();
      return send(res, 200, { peers: db.peers, aliases: db.aliases, notices: db.notices, salt: db.salt, effectiveSalt: currentSalt(), autoSalt: db.autoSalt,
        argon2: db.argon2, collectCrashes: db.collectCrashes, reports: db.reports.length, bytes: Buffer.byteLength(c.body), etag: c.etag });
    }
    if (p === '/peers' && m === 'POST') {
      const peer = validatePeer(await readJson(req));
      const i = db.peers.findIndex(x => x.id === peer.id && x.scope === peer.scope);
      if (i < 0 && db.peers.length >= L.peers) throw new Error('peer limit 100000');
      if (i >= 0) db.peers[i] = peer; else db.peers.push(peer);
      save();
      if (Buffer.byteLength(buildList().body) > L.list) { db.peers.splice(i >= 0 ? i : db.peers.length - 1, 1); save(); throw new Error('list would exceed 4 MiB'); }
      return send(res, 200, peer);
    }
    if ((mm = /^\/peers\/(prod|test)\/(-?\d+)$/.exec(p)) && m === 'DELETE') {
      db.peers = db.peers.filter(x => !(x.scope === mm[1] && x.id === mm[2])); save(); return send(res, 200, { ok: true });
    }
    if (p === '/aliases' && m === 'PUT') {
      db.aliases = validateAliases((await readJson(req)).aliases); save(); return send(res, 200, db.aliases);
    }
    if (p === '/notices' && m === 'POST') {
      const b = await readJson(req);
      const old = db.notices.find(x => x.id === b.id);
      if (!old && db.notices.length >= L.notices) throw new Error('notice limit 64');
      const n = { ...b }; delete n.photoData; delete n.removePhoto;
      if (old) { n.rev = Math.max(+b.rev || 0, old.rev) + (b.bump === false ? 0 : 1); n.photo = old.photo; } else { n.rev = +b.rev || 0; n.photo = null; }
      delete n.bump;
      validateNotice(n);
      if (b.removePhoto && n.photo) { rmPhoto(old); n.photo = null; }
      if (b.photoData) {
        const buf = Buffer.from(String(b.photoData).replace(/^data:[^,]*,/, ''), 'base64');
        const info = imageInfo(buf);
        if (!info) throw new Error('photo must be jpeg or png');
        if (buf.length > L.photo) throw new Error('photo up to 1 MB');
        rmPhoto(old);
        fs.writeFileSync(photoFile(n.id, n.rev, info.ext), buf);
        n.photo = { rev: n.rev, ext: info.ext, width: info.width, height: info.height };
      } else if (n.photo && old && n.photo.rev !== n.rev) {      // rev bumped, keep same picture under new rev
        const from = photoFile(n.id, n.photo.rev, n.photo.ext);
        n.photo = { ...n.photo, rev: n.rev };
        fs.renameSync(from, photoFile(n.id, n.rev, n.photo.ext));
      }
      if (old) db.notices[db.notices.indexOf(old)] = n; else db.notices.push(n);
      save(); return send(res, 200, n);
    }
    if ((mm = /^\/notices\/([\w-]+)$/.exec(p)) && m === 'DELETE') {
      rmPhoto(db.notices.find(x => x.id === mm[1])); db.notices = db.notices.filter(x => x.id !== mm[1]); save(); return send(res, 200, { ok: true });
    }
    if (p === '/settings' && m === 'POST') {
      const b = await readJson(req), a = b.argon2 || db.argon2;
      const inr = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
      if (!inr(a.memory, 1024, 65536) || !inr(a.passes, 1, 8) || !inr(a.lanes, 1, 8)) throw new Error('argon2 out of range');
      if (a.memory * a.passes > 65536) throw new Error('memory × passes must be ≤ 65536');
      if (b.regenerateSalt) db.salt = b64(crypto.randomBytes(16));
      else if (b.salt) {
        const len = Buffer.from(b.salt, 'base64').length;
        if (len < 8 || len > 64 || b64(Buffer.from(b.salt, 'base64')) !== b.salt) throw new Error('salt: 8-64 bytes, standard base64 with padding');
        db.salt = b.salt;
      }
      db.argon2 = { memory: a.memory, passes: a.passes, lanes: a.lanes };
      if (typeof b.autoSalt === 'boolean') db.autoSalt = b.autoSalt;
      if (typeof b.collectCrashes === 'boolean') db.collectCrashes = b.collectCrashes;
      save(); return send(res, 200, { ok: true });
    }
    if (p === '/reports' && m === 'GET') return send(res, 200, db.reports.slice(-500).reverse());
    if ((mm = /^\/reports\/(\d+)$/.exec(p)) && m === 'DELETE') {
      const r = db.reports.find(x => x.id === +mm[1]);
      if (r?.dump) fs.rmSync(path.join(DUMP_DIR, r.dump), { force: true });
      db.reports = db.reports.filter(x => x.id !== +mm[1]); save(); return send(res, 200, { ok: true });
    }
    if ((mm = /^\/reports\/(\d+)\/dump$/.exec(p)) && m === 'GET') {
      const r = db.reports.find(x => x.id === +mm[1]);
      if (!r?.dump) return send(res, 404, { error: 'no dump' });
      res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${r.dump}"` });
      return res.end(fs.readFileSync(path.join(DUMP_DIR, r.dump)));
    }
    if ((mm = /^\/notices\/([\w-]+)\/photo$/.exec(p)) && m === 'GET') {
      const n = db.notices.find(x => x.id === mm[1]);
      if (!n?.photo) return send(res, 404, { error: 'no photo' });
      res.writeHead(200, { 'content-type': n.photo.ext === 'png' ? 'image/png' : 'image/jpeg' });
      return res.end(fs.readFileSync(photoFile(n.id, n.photo.rev, n.photo.ext)));
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    if (e.code) throw e;
    send(res, 400, { error: e.message });
  }
}

// ---------- tele public API ----------
async function pub(req, res, url) {
  const act = url.searchParams.get('act');
  if (req.method === 'GET' && url.pathname === '/v1/badges') {
    const c = buildList();
    if (req.headers['if-none-match'] === c.etag) return send(res, 304, '', { etag: c.etag });
    return send(res, 200, c.body, { 'content-type': 'application/json', etag: c.etag, 'cache-control': 'no-cache' });
  }
  let mm;
  if (req.method === 'GET' && (mm = /^\/v1\/notices\/([\w-]+)\/photo$/.exec(url.pathname))) {
    const n = db.notices.find(x => x.id === mm[1] && x.enabled !== false);
    if (!n?.photo) return send(res, 404, 'Not found');
    res.writeHead(200, { 'content-type': n.photo.ext === 'png' ? 'image/png' : 'image/jpeg', 'cache-control': 'public, max-age=86400' });
    return res.end(fs.readFileSync(photoFile(n.id, n.photo.rev, n.photo.ext)));
  }
  if (url.pathname === '/v1/crash.php') {
    if (!db.collectCrashes) return send(res, 404, 'Not found');
    if (req.method === 'GET' && act === 'query_report') return send(res, 200, 'Report');
    if (req.method === 'POST' && act === 'report') {
      const f = parseMultipart(await readBody(req, L.dump + 1024 * 1024), req.headers['content-type']);
      const id = db.nextReport++;
      let dump = null;
      if (Buffer.isBuffer(f.dump) && f.dump.length <= L.dump) { dump = `${id}.zip`; fs.writeFileSync(path.join(DUMP_DIR, dump), f.dump); }
      const report = String(typeof f.report === 'string' ? f.report : '').slice(0, 65536);
      const notes = [...report.matchAll(/^Tele-Note:\s*(.+)$/gm)].map(x => x[1].trim());
      db.reports.push({ id, time: Math.floor(Date.now() / 1000), platform: String(f.platform || '').slice(0, 64), version: String(f.version || '').slice(0, 64), notes, report, dump });
      if (db.reports.length > 5000) { const old = db.reports.shift(); if (old.dump) fs.rmSync(path.join(DUMP_DIR, old.dump), { force: true }); }
      save(); return send(res, 200, `Done ${id}`);
    }
  }
  send(res, 404, 'Not found');
}

// Static files for the admin panel (public/). Paths outside public/ are refused.
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};
function serveStatic(res, rel) {
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, 'Not found');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/admin' || url.pathname === '/admin/') return serveStatic(res, 'index.html');
    if (url.pathname.startsWith('/admin/api/')) return await admin(req, res, url);
    if (url.pathname.startsWith('/admin/')) return serveStatic(res, url.pathname.slice('/admin/'.length));
    await pub(req, res, url);
  } catch (e) {
    send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.message });
  }
}).listen(PORT, () => {
  console.log(`tele server on http://localhost:${PORT}   (set this in tele: settings → tele → server)`);
  console.log(`admin panel:  http://localhost:${PORT}/admin`);
  console.log(`admin token:  ${db.adminToken}`);
});
