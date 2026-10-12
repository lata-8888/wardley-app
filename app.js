'use strict';
/* Wardley Maps – Prototyp (lokal, ohne Backend)
   Alle Datenzugriffe laufen über das API-Objekt. Später wird es durch Supabase ersetzt. */
(function (root) {

/* ---------- Helfer ---------- */
const CFG = root.APP_CONFIG || { BACKEND: 'local' };
const DICT = { en: {} };           // Übersetzungen: Schlüssel = deutscher Text
const LANG = 'de';
const t = s => (DICT[LANG] && DICT[LANG][s]) || s;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clone = o => JSON.parse(JSON.stringify(o));
const now = () => new Date().toISOString();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (s, r) => (r || document).querySelector(s);
const fmtDate = iso => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
};

/* ---------- Geometrie und Rendering der Map ---------- */
const STAGES = ['Genesis', 'Custom built', 'Product', 'Commodity'];
const G = { W: 1000, H: 640, X0: 90, X1: 970, Y0: 30, Y1: 560 };
const px = n => G.X0 + n * (G.X1 - G.X0);
const py = n => G.Y0 + n * (G.Y1 - G.Y0);
const nx = x => (x - G.X0) / (G.X1 - G.X0);
const ny = y => (y - G.Y0) / (G.Y1 - G.Y0);
const TYPES = ['component', 'anchor', 'note'];
const LABELS = ['right', 'left', 'below', 'above'];

function mapSvg(data, o) {
  o = o || {};
  const p = o.id || 'm';
  const nodes = (data && data.nodes) || [];
  const links = (data && data.links) || [];
  const by = {};
  nodes.forEach(n => { by[n.id] = n; });
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${G.W} ${G.H}" font-family="system-ui,sans-serif">`;
  s += `<defs><marker id="${p}-ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M2 1L8 5L2 9" fill="none" stroke="#D85A30" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`;
  s += `<rect x="0" y="0" width="${G.W}" height="${G.H}" fill="#fff"/>`;
  const colW = (G.X1 - G.X0) / 4;
  for (let k = 1; k < 4; k++) {
    s += `<line x1="${G.X0 + k * colW}" y1="${G.Y0}" x2="${G.X0 + k * colW}" y2="${G.Y1}" stroke="#d3d1c7" stroke-width="1" stroke-dasharray="5 5"/>`;
  }
  s += `<line x1="${G.X0}" y1="${G.Y0}" x2="${G.X0}" y2="${G.Y1}" stroke="#888780" stroke-width="1.5"/>`;
  s += `<line x1="${G.X0}" y1="${G.Y1}" x2="${G.X1}" y2="${G.Y1}" stroke="#888780" stroke-width="1.5"/>`;
  s += `<text x="10" y="${G.Y0 + 12}" font-size="12" fill="#5f5e5a">${t('Sichtbar')}</text>`;
  s += `<text x="10" y="${G.Y1 - 4}" font-size="12" fill="#5f5e5a">${t('Unsichtbar')}</text>`;
  STAGES.forEach((n, i) => {
    s += `<text x="${G.X0 + colW * i + colW / 2}" y="${G.Y1 + 26}" font-size="13" text-anchor="middle" fill="#5f5e5a">${esc(n)}</text>`;
  });
  s += `<text x="${G.X1}" y="${G.Y1 + 54}" font-size="12" text-anchor="end" fill="#5f5e5a">${t('Evolution')} →</text>`;
  links.forEach(l => {
    const a = by[l.from], b = by[l.to];
    if (a && b) s += `<line x1="${px(a.x)}" y1="${py(a.y)}" x2="${px(b.x)}" y2="${py(b.y)}" stroke="#888780" stroke-width="1.5"/>`;
  });
  nodes.forEach(n => {
    if (n.type !== 'note' && typeof n.evo === 'number' && n.evo > n.x + 0.02) {
      s += `<line x1="${px(n.x) + 13}" y1="${py(n.y)}" x2="${px(n.evo)}" y2="${py(n.y)}" stroke="#D85A30" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#${p}-ar)"/>`;
    }
  });
  nodes.forEach(n => {
    const x = px(n.x), y = py(n.y);
    s += `<g data-node="${esc(n.id)}" style="cursor:pointer">`;
    if (n.type === 'note') {
      const w = Math.max(60, n.name.length * 7.5 + 20);
      s += `<rect x="${x - w / 2}" y="${y - 14}" width="${w}" height="28" rx="4" fill="#FAEEDA" stroke="#854F0B" stroke-width="1.2"/>`;
      s += `<text x="${x}" y="${y + 5}" font-size="13" text-anchor="middle" fill="#412402">${esc(n.name)}</text>`;
    } else {
      const anchor = n.type === 'anchor';
      const r = anchor ? 10 : 8;
      const fill = anchor ? '#E1F5EE' : n.build ? '#FAECE7' : '#F1EFE8';
      const stroke = anchor ? '#0F6E56' : n.build ? '#993C1D' : '#5F5E5A';
      s += `<circle cx="${x}" cy="${y}" r="18" fill="transparent"/>`;
      s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
      let lx = x + r + 8, ly = y + 5, anc = 'start';
      if (n.label === 'left') { lx = x - r - 8; anc = 'end'; }
      else if (n.label === 'below') { lx = x; ly = y + r + 18; anc = 'middle'; }
      else if (n.label === 'above') { lx = x; ly = y - r - 8; anc = 'middle'; }
      s += `<text x="${lx}" y="${ly}" font-size="14" text-anchor="${anc}" fill="#2c2c2a"${anchor ? ' font-weight="600"' : ''}>${esc(n.name)}</text>`;
    }
    s += '</g>';
    if (o.sel === n.id) s += `<circle cx="${x}" cy="${y}" r="17" fill="none" stroke="#185FA5" stroke-width="2" stroke-dasharray="4 3" pointer-events="none"/>`;
    if (o.linkFrom === n.id) s += `<circle cx="${x}" cy="${y}" r="17" fill="none" stroke="#185FA5" stroke-width="3" pointer-events="none"/>`;
  });
  return s + '</svg>';
}

/* ---------- Datenmodell: Prüfen und Vorlagen ---------- */
function sanitize(d) {
  const out = { nodes: [], links: [] };
  if (!d || typeof d !== 'object') return out;
  const ids = new Set();
  (Array.isArray(d.nodes) ? d.nodes : []).slice(0, 500).forEach(n => {
    if (!n || typeof n.id !== 'string' || ids.has(n.id)) return;
    const node = {
      id: n.id.slice(0, 40),
      name: String(n.name == null ? '' : n.name).slice(0, 80),
      x: clamp(Number(n.x) || 0, 0, 1),
      y: clamp(Number(n.y) || 0, 0, 1),
      type: TYPES.includes(n.type) ? n.type : 'component',
      build: !!n.build,
      label: LABELS.includes(n.label) ? n.label : 'right',
      desc: String(n.desc == null ? '' : n.desc).slice(0, 500)
    };
    if (typeof n.evo === 'number' && isFinite(n.evo)) node.evo = clamp(n.evo, 0, 1);
    ids.add(node.id);
    out.nodes.push(node);
  });
  const seen = new Set();
  (Array.isArray(d.links) ? d.links : []).slice(0, 2000).forEach(l => {
    if (!l || !ids.has(l.from) || !ids.has(l.to) || l.from === l.to) return;
    const key = [l.from, l.to].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.links.push({ from: l.from, to: l.to });
  });
  return out;
}

function teaTemplate() {
  const id = {};
  ['kunde', 'shop', 'empf', 'zahl', 'sort', 'vers', 'host', 'strom', 'ki'].forEach(k => { id[k] = uid(); });
  const N = (k, name, x, y, o) => Object.assign({ id: id[k], name, x, y, type: 'component', build: false, label: 'right', desc: '' }, o || {});
  const L = (a, b) => ({ from: id[a], to: id[b] });
  return {
    nodes: [
      N('kunde', 'Tee-Kunde', 0.446, 0.059, { type: 'anchor' }),
      N('shop', 'Onlineshop', 0.571, 0.235),
      N('empf', 'Empfehlungsalgorithmus', 0.357, 0.382, { build: true, label: 'left', evo: 0.473 }),
      N('zahl', 'Zahlungen', 0.821, 0.441),
      N('sort', 'Seltene Teesorten', 0.446, 0.559, { build: true, label: 'below' }),
      N('vers', 'Versand', 0.661, 0.618, { label: 'below' }),
      N('host', 'Hosting', 0.857, 0.794, { label: 'left' }),
      N('strom', 'Strom', 0.929, 0.912, { label: 'left' }),
      N('ki', 'KI-Teeberater', 0.071, 0.765, { build: true, label: 'below', evo: 0.223 })
    ],
    links: [L('kunde', 'shop'), L('shop', 'empf'), L('shop', 'zahl'), L('shop', 'sort'), L('shop', 'vers'), L('shop', 'host'), L('empf', 'ki'), L('host', 'strom')]
  };
}

/* ---------- Lokale Datenschicht ---------- */
const LS_DB = 'wm.db.v1', LS_SES = 'wm.session.v1';
let db = null;

function seed() {
  const U = (name, pin, isAdmin) => ({ id: uid(), name, pin, isAdmin, active: true, created: now() });
  const admin = U('Admin', '1234', true), anna = U('Anna', '1111', false), ben = U('Ben', '2222', false);
  const m = {
    id: uid(), title: 'Online-Teeshop (Beispiel)', owner: admin.id,
    members: { [anna.id]: 'editor', [ben.id]: 'viewer' },
    data: teaTemplate(), created: now(), updated: now(), rev: 1
  };
  return { users: [admin, anna, ben], maps: [m], versions: [] };
}
function loadDb() {
  try { db = JSON.parse(root.localStorage.getItem(LS_DB)); } catch (e) { console.error('db lesen', e); db = null; }
  if (!db || !Array.isArray(db.users) || !Array.isArray(db.maps)) { db = seed(); persist(); }
  if (!Array.isArray(db.versions)) db.versions = [];
}
function persist() {
  try { root.localStorage.setItem(LS_DB, JSON.stringify(db)); }
  catch (e) { console.error('db schreiben', e); throw new Error(t('Speichern im Browser fehlgeschlagen')); }
}

const roleOf = (m, u) => u.isAdmin ? 'admin' : m.owner === u.id ? 'owner' : ((m.members && m.members[u.id]) || null);
const canEdit = r => r === 'admin' || r === 'owner' || r === 'editor';
const canManage = r => r === 'admin' || r === 'owner';
const ROLE_LABEL = { admin: 'Admin', owner: 'Besitzer', editor: 'Bearbeiter', viewer: 'Leser' };
const validPin = p => /^\d{4,8}$/.test(String(p));

function me() {
  const id = root.localStorage.getItem(LS_SES);
  return db.users.find(u => u.id === id && u.active) || null;
}
function needUser() { const u = me(); if (!u) throw new Error(t('Nicht angemeldet')); return u; }
function needAdmin() { const u = needUser(); if (!u.isAdmin) throw new Error(t('Nur für Admins')); return u; }
function mapFor(id, u) {
  const m = db.maps.find(x => x.id === id);
  const r = m && roleOf(m, u);
  if (!m || !r) throw new Error(t('Map nicht gefunden oder kein Zugriff'));
  return { m, role: r };
}
const userName = id => { const u = db.users.find(x => x.id === id); return u ? u.name : '?'; };

const LocalApi = {
  me,
  async init() { loadDb(); },
  async login(name, pin) {
    const u = db.users.find(x => x.active && x.name.toLowerCase() === String(name).trim().toLowerCase());
    if (!u || u.pin !== String(pin)) throw new Error(t('Name oder PIN falsch'));
    root.localStorage.setItem(LS_SES, u.id);
    return u;
  },
  async logout() { root.localStorage.removeItem(LS_SES); },

  /* Benutzer */
  async listUsers() { needAdmin(); return clone(db.users); },
  async listUserNames() { needUser(); return db.users.filter(u => u.active).map(u => ({ id: u.id, name: u.name })); },
  async createUser({ name, pin, isAdmin }) {
    needAdmin();
    name = String(name || '').trim().slice(0, 40);
    if (!name) throw new Error(t('Name fehlt'));
    if (!validPin(pin)) throw new Error(t('PIN: 4 bis 8 Ziffern'));
    if (db.users.some(u => u.name.toLowerCase() === name.toLowerCase())) throw new Error(t('Name existiert bereits'));
    const u = { id: uid(), name, pin: String(pin), isAdmin: !!isAdmin, active: true, created: now() };
    db.users.push(u); persist(); return clone(u);
  },
  async updateUser(id, patch) {
    const a = needAdmin();
    const u = db.users.find(x => x.id === id);
    if (!u) throw new Error(t('Benutzer nicht gefunden'));
    if (id === a.id && (patch.isAdmin === false || patch.active === false)) throw new Error(t('Eigene Rechte nicht entziehbar'));
    if ('isAdmin' in patch) u.isAdmin = !!patch.isAdmin;
    if ('active' in patch) u.active = !!patch.active;
    persist(); return clone(u);
  },
  async resetPin(id, pin) {
    needAdmin();
    if (!validPin(pin)) throw new Error(t('PIN: 4 bis 8 Ziffern'));
    const u = db.users.find(x => x.id === id);
    if (!u) throw new Error(t('Benutzer nicht gefunden'));
    u.pin = String(pin); persist();
  },
  async deleteUser(id) {
    const a = needAdmin();
    if (id === a.id) throw new Error(t('Eigenes Konto nicht löschbar'));
    db.maps.forEach(m => { if (m.owner === id) m.owner = a.id; if (m.members) delete m.members[id]; });
    db.users = db.users.filter(u => u.id !== id);
    persist();
  },

  /* Maps */
  async listMaps() {
    const u = needUser();
    return db.maps.map(m => ({ m, r: roleOf(m, u) })).filter(x => x.r).map(({ m, r }) => ({
      id: m.id, title: m.title, owner: m.owner, ownerName: userName(m.owner), updated: m.updated, role: r, data: m.data
    })).sort((a, b) => b.updated.localeCompare(a.updated));
  },
  async getMap(id) {
    const { m, role } = mapFor(id, needUser());
    return Object.assign(clone(m), { role, ownerName: userName(m.owner) });
  },
  async createMap({ title, template, data }) {
    const u = needUser();
    const m = {
      id: uid(), title: String(title || '').trim().slice(0, 100) || t('Neue Map'), owner: u.id, members: {},
      data: data ? sanitize(data) : template === 'tea' ? teaTemplate() : { nodes: [], links: [] },
      created: now(), updated: now(), rev: 1
    };
    db.maps.push(m); persist(); return m.id;
  },
  async saveMap(id, { title, data }) {
    const { m, role } = mapFor(id, needUser());
    if (!canEdit(role)) throw new Error(t('Keine Bearbeitungsrechte'));
    if (typeof title === 'string' && title.trim()) m.title = title.trim().slice(0, 100);
    if (data) m.data = sanitize(data);
    m.updated = now(); m.rev = (m.rev || 0) + 1;
    persist(); return m.rev;
  },
  async duplicateMap(id) {
    const u = needUser();
    const { m } = mapFor(id, u);
    const c = { id: uid(), title: (m.title + ' ' + t('(Kopie)')).slice(0, 100), owner: u.id, members: {}, data: clone(m.data), created: now(), updated: now(), rev: 1 };
    db.maps.push(c); persist(); return c.id;
  },
  async deleteMap(id) {
    const { role } = mapFor(id, needUser());
    if (!canManage(role)) throw new Error(t('Nur Besitzer oder Admin'));
    db.maps = db.maps.filter(m => m.id !== id);
    db.versions = db.versions.filter(v => v.mapId !== id);
    persist();
  },
  async setMembers(id, members) {
    const { m, role } = mapFor(id, needUser());
    if (!canManage(role)) throw new Error(t('Nur Besitzer oder Admin'));
    const clean = {};
    Object.keys(members || {}).forEach(uidk => {
      if (uidk !== m.owner && db.users.some(u => u.id === uidk) && (members[uidk] === 'editor' || members[uidk] === 'viewer')) clean[uidk] = members[uidk];
    });
    m.members = clean; persist();
  },

  /* Versionen */
  async listVersions(mapId) {
    mapFor(mapId, needUser());
    return db.versions.filter(v => v.mapId === mapId).sort((a, b) => b.created.localeCompare(a.created))
      .map(v => ({ id: v.id, label: v.label, created: v.created, byName: userName(v.by) }));
  },
  async addVersion(mapId, label) {
    const u = needUser();
    const { m, role } = mapFor(mapId, u);
    if (!canEdit(role)) throw new Error(t('Keine Bearbeitungsrechte'));
    db.versions.push({ id: uid(), mapId, label: String(label || '').trim().slice(0, 80), created: now(), by: u.id, data: clone(m.data) });
    const mine = db.versions.filter(v => v.mapId === mapId).sort((a, b) => a.created.localeCompare(b.created));
    while (mine.length > 50) { const old = mine.shift(); db.versions = db.versions.filter(v => v.id !== old.id); }
    persist();
  },
  async getVersionData(mapId, versionId) {
    mapFor(mapId, needUser());
    const v = db.versions.find(x => x.id === versionId && x.mapId === mapId);
    if (!v) throw new Error(t('Version nicht gefunden'));
    return clone(v.data);
  }
};

/* ---------- Supabase-Datenschicht (gleiche Schnittstelle wie LocalApi) ---------- */
function makeSupabaseApi() {
  let sb = null, cur = null;
  const client = () => {
    if (sb) return sb;
    if (!root.supabase || !root.supabase.createClient) throw new Error(t('supabase-js konnte nicht geladen werden'));
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !CFG.EMAIL_DOMAIN) throw new Error(t('config.js unvollständig (SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMAIN)'));
    sb = root.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    return sb;
  };
  const must = r => {
    if (r.error) {
      if (r.error.code === 'PGRST116') throw new Error(t('Nicht gefunden oder keine Berechtigung'));
      throw new Error(r.error.message);
    }
    return r.data;
  };
  const loginKey = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const toUser = p => ({ id: p.id, name: p.name, isAdmin: !!p.is_admin, active: !!p.active, created: p.created_at });
  const needUser = () => { if (!cur) throw new Error(t('Nicht angemeldet')); return cur; };
  const roleFrom = (m, u, members) => u.isAdmin ? 'admin' : m.owner_id === u.id ? 'owner' : (members[u.id] || 'viewer');

  async function loadMe() {
    const s = (await client().auth.getSession()).data.session;
    if (!s) { cur = null; return; }
    const p = must(await client().from('profiles').select('id,name,is_admin,active,created_at').eq('id', s.user.id).maybeSingle());
    if (!p || !p.active) { await client().auth.signOut(); cur = null; return; }
    cur = toUser(p);
  }

  return {
    me: () => cur,
    async init() { await loadMe(); },
    async login(name, pin) {
      const key = loginKey(name);
      if (!key) throw new Error(t('Name oder PIN falsch'));
      const r = await client().auth.signInWithPassword({ email: key + '@' + CFG.EMAIL_DOMAIN, password: String(pin) });
      if (r.error) { console.error('login', r.error); throw new Error(t('Name oder PIN falsch')); }
      await loadMe();
      if (!cur) throw new Error(t('Konto deaktiviert'));
      return cur;
    },
    async logout() { cur = null; try { await client().auth.signOut(); } catch (e) { console.error('logout', e); } },

    async listUsers() {
      needUser();
      return must(await client().from('profiles').select('id,name,is_admin,active,created_at').order('name')).map(toUser);
    },
    async listUserNames() {
      needUser();
      return must(await client().from('profiles').select('id,name').eq('active', true).order('name'));
    },
    async createUser({ name, pin, isAdmin }) {
      must(await client().rpc('admin_create_user', { p_name: String(name || ''), p_pin: String(pin || ''), p_is_admin: !!isAdmin }));
    },
    async updateUser(id, patch) {
      const p = must(await client().from('profiles').select('is_admin,active').eq('id', id).single());
      must(await client().rpc('admin_set_user_flags', {
        p_user: id,
        p_is_admin: 'isAdmin' in patch ? !!patch.isAdmin : p.is_admin,
        p_active: 'active' in patch ? !!patch.active : p.active
      }));
    },
    async resetPin(id, pin) { must(await client().rpc('admin_reset_pin', { p_user: id, p_pin: String(pin || '') })); },
    async deleteUser(id) { must(await client().rpc('admin_delete_user', { p_user: id })); },

    async listMaps() {
      const u = needUser();
      const maps = must(await client().from('maps')
        .select('id,title,owner_id,data,updated_at,owner:profiles!maps_owner_id_fkey(name)')
        .order('updated_at', { ascending: false }));
      const mine = {};
      if (!u.isAdmin) must(await client().from('map_members').select('map_id,role').eq('user_id', u.id)).forEach(x => { mine[x.map_id] = x.role; });
      return maps.map(m => ({
        id: m.id, title: m.title, owner: m.owner_id, ownerName: (m.owner && m.owner.name) || '?',
        updated: m.updated_at, data: m.data,
        role: u.isAdmin ? 'admin' : m.owner_id === u.id ? 'owner' : (mine[m.id] || 'viewer')
      }));
    },
    async getMap(id) {
      const u = needUser();
      const m = must(await client().from('maps')
        .select('id,title,owner_id,data,rev,updated_at,owner:profiles!maps_owner_id_fkey(name),members:map_members(user_id,role)')
        .eq('id', id).maybeSingle());
      if (!m) throw new Error(t('Map nicht gefunden oder kein Zugriff'));
      const members = {};
      (m.members || []).forEach(x => { members[x.user_id] = x.role; });
      return { id: m.id, title: m.title, owner: m.owner_id, ownerName: (m.owner && m.owner.name) || '?', members, data: m.data, rev: m.rev, updated: m.updated_at, role: roleFrom(m, u, members) };
    },
    async createMap({ title, template, data }) {
      const u = needUser();
      const d = data ? sanitize(data) : template === 'tea' ? teaTemplate() : { nodes: [], links: [] };
      return must(await client().from('maps').insert({ title: String(title || '').trim().slice(0, 100) || t('Neue Map'), owner_id: u.id, data: d }).select('id').single()).id;
    },
    async saveMap(id, { title, data }) {
      const patch = {};
      if (typeof title === 'string' && title.trim()) patch.title = title.trim().slice(0, 100);
      if (data) patch.data = sanitize(data);
      return must(await client().from('maps').update(patch).eq('id', id).select('rev').single()).rev;
    },
    async duplicateMap(id) {
      const u = needUser();
      const m = must(await client().from('maps').select('title,data').eq('id', id).single());
      return must(await client().from('maps').insert({ title: (m.title + ' ' + t('(Kopie)')).slice(0, 100), owner_id: u.id, data: m.data }).select('id').single()).id;
    },
    async deleteMap(id) {
      const r = must(await client().from('maps').delete().eq('id', id).select('id'));
      if (!r.length) throw new Error(t('Nur Besitzer oder Admin'));
    },
    async setMembers(id, members) { must(await client().rpc('set_map_members', { p_map: id, p_members: members || {} })); },

    async listVersions(mapId) {
      needUser();
      return must(await client().from('map_versions')
        .select('id,label,created_at,by:profiles!map_versions_created_by_fkey(name)')
        .eq('map_id', mapId).order('created_at', { ascending: false }))
        .map(v => ({ id: v.id, label: v.label, created: v.created_at, byName: (v.by && v.by.name) || '?' }));
    },
    async addVersion(mapId, label) {
      const u = needUser();
      const m = must(await client().from('maps').select('data').eq('id', mapId).single());
      must(await client().from('map_versions').insert({ map_id: mapId, label: String(label || '').trim().slice(0, 80), data: m.data, created_by: u.id }));
    },
    async getVersionData(mapId, versionId) {
      return must(await client().from('map_versions').select('data').eq('id', versionId).eq('map_id', mapId).single()).data;
    }
  };
}

const API = CFG.BACKEND === 'supabase' ? makeSupabaseApi() : LocalApi;

/* ---------- UI-Helfer ---------- */
function toast(msg) {
  const el = $('#toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function modal(html) {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(o);
  const close = () => o.remove();
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-close]')) close(); });
  return { el: o, close };
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileSafe = s => String(s).replace(/[^\w\-]+/g, '_').slice(0, 60) || 'map';
const fail = e => { console.error(e); toast(e && e.message ? e.message : String(e)); };

let cleanup = () => {};
const view = () => $('#view');

/* ---------- Login und Shell ---------- */
function renderLogin() {
  $('#app').innerHTML = `<div class="login"><div class="card">
    <h1>${t('Wardley Maps')}</h1><p class="meta">${t('Anmelden')}</p>
    <form id="lf" autocomplete="off">
      <label>${t('Name')}<input id="ln" required maxlength="40" autofocus></label>
      <label>${t('PIN')}<input id="lp" type="password" inputmode="numeric" required maxlength="8"></label>
      <div class="error" id="le"></div>
      <button class="btn primary" style="width:100%;margin-top:6px">${t('Anmelden')}</button>
    </form>
    ${CFG.BACKEND === 'supabase' ? '' : `<p class="hint">${t('Prototyp: Daten liegen nur in diesem Browser.')}<br>Demo: Admin / 1234 · Anna / 1111 · Ben / 2222</p>`}
  </div></div>`;
  $('#lf').addEventListener('submit', async e => {
    e.preventDefault();
    try { await API.login($('#ln').value, $('#lp').value); route(); }
    catch (err) { console.error(err); $('#le').textContent = err.message; }
  });
}
function shell(u) {
  const h = location.hash;
  $('#app').innerHTML = `<header class="top">
    <span class="brand">${t('Wardley Maps')}</span>
    <nav><a href="#/library" class="${h.startsWith('#/admin') ? '' : 'on'}">${t('Library')}</a>${u.isAdmin ? `<a href="#/admin" class="${h.startsWith('#/admin') ? 'on' : ''}">${t('Admin')}</a>` : ''}</nav>
    <div class="user"><span>${esc(u.name)}${u.isAdmin ? `<span class="badge">Admin</span>` : ''}</span><button class="btn small" id="logout">${t('Abmelden')}</button></div>
  </header><main id="view"></main>`;
  $('#logout').onclick = async () => { await API.logout(); location.hash = ''; route(); };
}

/* ---------- Library ---------- */
async function viewLibrary() {
  const u = API.me();
  const maps = await API.listMaps();
  view().innerHTML = `<div class="bar"><h1>${t('Library')}</h1>
    <input type="search" id="q" placeholder="${t('Suchen …')}" aria-label="${t('Suchen …')}">
    <button class="btn" id="imp">${t('Import (JSON)')}</button>
    <button class="btn primary" id="new">+ ${t('Neue Map')}</button>
    <input type="file" id="file" accept="application/json,.json" hidden></div>
    <div class="grid" id="grid"></div>`;
  const grid = $('#grid');
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const list = maps.filter(m => !q || m.title.toLowerCase().includes(q) || m.ownerName.toLowerCase().includes(q));
    if (!list.length) { grid.innerHTML = `<div class="empty">${t('Keine Maps gefunden.')}</div>`; return; }
    grid.innerHTML = list.map(m => `<div class="card mapcard">
      <div class="thumb" data-act="open" data-id="${esc(m.id)}">${mapSvg(m.data, { id: 't' + m.id })}</div>
      <div class="title">${esc(m.title)}<span class="badge ${m.role === 'viewer' ? 'gray' : ''}">${t(ROLE_LABEL[m.role])}</span></div>
      <div class="meta">${esc(m.ownerName)} · ${esc(fmtDate(m.updated))}</div>
      <div class="actions">
        <button class="btn small primary" data-act="open" data-id="${esc(m.id)}">${canEdit(m.role) ? t('Öffnen') : t('Ansehen')}</button>
        <button class="btn small" data-act="dup" data-id="${esc(m.id)}">${t('Duplizieren')}</button>
        ${canManage(m.role) ? `<button class="btn small" data-act="share" data-id="${esc(m.id)}">${t('Teilen')}</button>
        <button class="btn small danger" data-act="del" data-id="${esc(m.id)}">${t('Löschen')}</button>` : ''}
      </div></div>`).join('');
  };
  draw();
  $('#q').addEventListener('input', draw);

  $('#new').onclick = () => {
    const md = modal(`<h2>${t('Neue Map')}</h2>
      <label>${t('Titel')}<input id="nt" maxlength="100" placeholder="${t('Neue Map')}"></label>
      <label>${t('Vorlage')}<select id="ntpl"><option value="">${t('Leer')}</option><option value="tea">${t('Online-Teeshop (Beispiel)')}</option></select></label>
      <div class="foot"><button class="btn" data-close>${t('Abbrechen')}</button><button class="btn primary" id="ok">${t('Erstellen')}</button></div>`);
    $('#nt', md.el).focus();
    $('#ok', md.el).onclick = async () => {
      try { const id = await API.createMap({ title: $('#nt', md.el).value, template: $('#ntpl', md.el).value }); md.close(); location.hash = '#/map/' + id; }
      catch (e) { fail(e); }
    };
  };
  $('#imp').onclick = () => $('#file').click();
  $('#file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      if (f.size > 2e6) throw new Error(t('Datei zu gross'));
      const j = JSON.parse(await f.text());
      const data = sanitize(j && j.data ? j.data : j);
      if (!data.nodes.length) throw new Error(t('Keine gültige Map in der Datei'));
      const id = await API.createMap({ title: (j && j.title) || f.name.replace(/\.json$/i, ''), data });
      location.hash = '#/map/' + id;
    } catch (err) { fail(err); }
    e.target.value = '';
  };
  grid.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const id = el.dataset.id, act = el.dataset.act;
    try {
      if (act === 'open') location.hash = '#/map/' + id;
      else if (act === 'dup') { await API.duplicateMap(id); toast(t('Dupliziert')); viewLibrary(); }
      else if (act === 'del') {
        const m = maps.find(x => x.id === id);
        const md = modal(`<h2>${t('Map löschen?')}</h2><p>${esc(m.title)}</p>
          <div class="foot"><button class="btn" data-close>${t('Abbrechen')}</button><button class="btn danger" id="ok">${t('Löschen')}</button></div>`);
        $('#ok', md.el).onclick = async () => { try { await API.deleteMap(id); md.close(); viewLibrary(); } catch (err) { fail(err); } };
      }
      else if (act === 'share') await shareDialog(id);
    } catch (err) { fail(err); }
  });
  void u;
}

async function shareDialog(id) {
  const m = await API.getMap(id);
  const users = (await API.listUserNames()).filter(x => x.id !== m.owner);
  let members = Object.assign({}, m.members || {});
  const md = modal(`<h2>${t('Teilen')}: ${esc(m.title)}</h2>
    <p class="meta">${t('Besitzer')}: ${esc(m.ownerName)}</p><div id="ml"></div>
    <div class="form-row" style="margin-top:12px"><label>${t('Person hinzufügen')}<select id="au"></select></label>
    <label>${t('Rolle')}<select id="ar"><option value="viewer">${t('Leser')}</option><option value="editor">${t('Bearbeiter')}</option></select></label>
    <button class="btn" id="add">+</button></div>
    <div class="foot"><button class="btn primary" data-close>${t('Fertig')}</button></div>`);
  const draw = () => {
    const ids = Object.keys(members).filter(k => users.some(x => x.id === k));
    $('#ml', md.el).innerHTML = ids.length ? ids.map(k => `<div class="member"><span>${esc(users.find(x => x.id === k).name)}</span>
      <select data-m="${esc(k)}"><option value="viewer" ${members[k] === 'viewer' ? 'selected' : ''}>${t('Leser')}</option><option value="editor" ${members[k] === 'editor' ? 'selected' : ''}>${t('Bearbeiter')}</option></select>
      <button class="btn small danger" data-rm="${esc(k)}">×</button></div>`).join('') : `<p class="meta">${t('Noch niemand.')}</p>`;
    const free = users.filter(x => !members[x.id]);
    $('#au', md.el).innerHTML = free.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
    $('#add', md.el).disabled = !free.length;
  };
  const save = async () => { try { await API.setMembers(id, members); } catch (e) { fail(e); } };
  draw();
  md.el.addEventListener('change', async e => { const k = e.target.dataset.m; if (k) { members[k] = e.target.value; await save(); } });
  md.el.addEventListener('click', async e => {
    const rm = e.target.dataset.rm;
    if (rm) { delete members[rm]; await save(); draw(); }
    if (e.target.id === 'add') { const k = $('#au', md.el).value; if (k) { members[k] = $('#ar', md.el).value; await save(); draw(); } }
  });
}

/* ---------- Admin ---------- */
async function viewAdmin() {
  const me0 = API.me();
  const users = await API.listUsers();
  const maps = await API.listMaps();
  view().innerHTML = `<div class="bar"><h1>${t('Admin')}</h1></div>
    <div class="card" style="margin-bottom:16px"><h2>${t('Person anlegen')}</h2>
      <form id="cf" class="form-row" autocomplete="off">
        <label>${t('Name')}<input id="cn" required maxlength="40"></label>
        <label>${t('PIN')} (4–8)<input id="cp" required maxlength="8" inputmode="numeric"></label>
        <label class="chk" style="flex:0 0 auto"><input type="checkbox" id="ca"> ${t('Admin')}</label>
        <button class="btn primary">${t('Anlegen')}</button></form></div>
    <div class="card"><h2>${t('Personen')}</h2><div style="overflow:auto"><table><thead><tr>
      <th>${t('Name')}</th><th>${t('Rolle')}</th><th>${t('Status')}</th><th>${t('Maps')}</th><th></th></tr></thead><tbody id="ub"></tbody></table></div></div>`;
  const body = $('#ub');
  const draw = () => {
    body.innerHTML = users.map(u => {
      const self = u.id === me0.id;
      const n = maps.filter(m => m.owner === u.id).length;
      return `<tr><td>${esc(u.name)}${self ? ` <span class="meta">(${t('du')})</span>` : ''}</td>
        <td>${u.isAdmin ? 'Admin' : t('Mitglied')}</td><td>${u.active ? t('aktiv') : t('deaktiviert')}</td><td>${n}</td>
        <td><div class="row-actions">
          <button class="btn small" data-act="admin" data-id="${esc(u.id)}" ${self ? 'disabled' : ''}>${u.isAdmin ? t('Admin entziehen') : t('Zum Admin machen')}</button>
          <button class="btn small" data-act="active" data-id="${esc(u.id)}" ${self ? 'disabled' : ''}>${u.active ? t('Deaktivieren') : t('Aktivieren')}</button>
          <button class="btn small" data-act="pin" data-id="${esc(u.id)}">${t('PIN zurücksetzen')}</button>
          <button class="btn small danger" data-act="del" data-id="${esc(u.id)}" ${self ? 'disabled' : ''}>${t('Löschen')}</button>
        </div></td></tr>`;
    }).join('');
  };
  draw();
  const reload = () => viewAdmin();
  $('#cf').addEventListener('submit', async e => {
    e.preventDefault();
    try { await API.createUser({ name: $('#cn').value, pin: $('#cp').value, isAdmin: $('#ca').checked }); toast(t('Person angelegt')); reload(); }
    catch (err) { fail(err); }
  });
  body.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const id = el.dataset.id, u = users.find(x => x.id === id);
    if (!me0.isAdmin) return;
    try {
      if (el.dataset.act === 'admin') { await API.updateUser(id, { isAdmin: !u.isAdmin }); reload(); }
      else if (el.dataset.act === 'active') { await API.updateUser(id, { active: !u.active }); reload(); }
      else if (el.dataset.act === 'pin') {
        const md = modal(`<h2>${t('PIN zurücksetzen')}: ${esc(u.name)}</h2>
          <label>${t('Neue PIN')} (4–8)<input id="np" maxlength="8" inputmode="numeric" autofocus></label>
          <div class="foot"><button class="btn" data-close>${t('Abbrechen')}</button><button class="btn primary" id="ok">${t('Speichern')}</button></div>`);
        $('#ok', md.el).onclick = async () => { try { await API.resetPin(id, $('#np', md.el).value); md.close(); toast(t('PIN gesetzt')); } catch (err) { fail(err); } };
      }
      else if (el.dataset.act === 'del') {
        const md = modal(`<h2>${t('Person löschen?')}</h2><p>${esc(u.name)}</p><p class="meta">${t('Maps dieser Person gehen an dich über.')}</p>
          <div class="foot"><button class="btn" data-close>${t('Abbrechen')}</button><button class="btn danger" id="ok">${t('Löschen')}</button></div>`);
        $('#ok', md.el).onclick = async () => { try { await API.deleteUser(id); md.close(); reload(); } catch (err) { fail(err); } };
      }
    } catch (err) { fail(err); }
  });
}

/* ---------- Designer ---------- */
async function viewDesigner(id) {
  const m = await API.getMap(id);
  const edit = canEdit(m.role);
  let data = sanitize(m.data), title = m.title;
  let sel = null, tool = 'select', linkFrom = null, drag = null, saveT = null, dirty = false, panelKey = '';
  const undo = [], redo = [];

  view().innerHTML = `<div class="d-head"><a href="#/library" class="btn small">← ${t('Library')}</a>
      <input class="title" id="mt" value="${esc(title)}" maxlength="100" ${edit ? '' : 'readonly'} aria-label="${t('Titel')}">
      ${edit ? '' : `<span class="badge gray">${t('Nur lesen')}</span>`}</div>
    <div class="d-toolbar">
      ${edit ? `<button class="btn tool active" data-tool="select">${t('Auswählen')}</button>
      <button class="btn tool" data-tool="add">+ ${t('Baustein')}</button>
      <button class="btn tool" data-tool="link">${t('Verbinden')}</button><span class="sep"></span>
      <button class="btn" id="undo">${t('Rückgängig')}</button><button class="btn" id="redo">${t('Wiederholen')}</button><span class="sep"></span>
      <button class="btn" id="ver">${t('Version speichern')}</button>` : ''}
      <button class="btn" id="exs">${t('Export SVG')}</button><button class="btn" id="exj">${t('Export JSON')}</button>
      <span id="status">${t('Gespeichert')}</span></div>
    <div class="d-main"><div class="d-canvas ${edit ? 'edit' : ''}" id="canvas"></div><aside class="d-panel" id="panel"></aside></div>`;
  const host = $('#canvas'), panel = $('#panel'), status = $('#status');

  const byId = k => data.nodes.find(n => n.id === k);
  const snap = () => JSON.stringify(data);
  const syncBtns = () => { if (!edit) return; $('#undo').disabled = !undo.length; $('#redo').disabled = !redo.length; };
  const pushUndo = () => { undo.push(snap()); if (undo.length > 100) undo.shift(); redo.length = 0; syncBtns(); };
  const draw = () => { host.innerHTML = mapSvg(data, { id: 'd', sel, linkFrom }); };
  const toSvg = e => {
    const r = host.querySelector('svg').getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * G.W, y: (e.clientY - r.top) / r.height * G.H };
  };

  async function flush() {
    clearTimeout(saveT);
    if (!dirty) return;
    dirty = false;
    try { await API.saveMap(id, { title, data }); status.textContent = t('Gespeichert'); }
    catch (e) { console.error(e); dirty = true; status.textContent = t('Fehler beim Speichern'); }
  }
  function changed() {
    if (!edit) return;
    dirty = true; status.textContent = t('Ungespeichert …');
    clearTimeout(saveT); saveT = setTimeout(flush, 700);
  }

  function select(k) {
    sel = k; tool === 'link' || (linkFrom = null);
    draw(); renderPanel();
  }
  function setTool(tl) {
    tool = tl; linkFrom = null;
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tl));
    host.style.cursor = tl === 'add' ? 'crosshair' : '';
    draw();
  }

  /* Panel */
  const opt = (arr, cur, labelFn) => arr.map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(labelFn(v))}</option>`).join('');
  async function renderPanel() {
    const n = sel && byId(sel);
    panelKey = n ? n.id : '';
    if (!n) {
      panel.innerHTML = `<h3>${t('Legende')}</h3>
        <div class="legend"><span class="dot anchor"></span>${t('Anker (Nutzer)')}</div>
        <div class="legend"><span class="dot std"></span>${t('Standard, einkaufen')}</div>
        <div class="legend"><span class="dot diff"></span>${t('Selbst bauen (Differenzierung)')}</div>
        <p class="meta">${edit ? t('Klicke einen Baustein an, um ihn zu bearbeiten. Mit + Baustein setzt du einen neuen Punkt aufs Canvas.') : t('Klicke einen Baustein an, um Details zu sehen.')}</p>
        <h3 style="margin-top:16px">${t('Versionen')}</h3><div id="vl" class="meta">…</div>`;
      try {
        const vs = await API.listVersions(id);
        const box = $('#vl', panel); if (!box) return;
        box.innerHTML = vs.length ? vs.map(v => `<div class="vrow"><span>${esc(v.label || t('Version'))}<br><small>${esc(fmtDate(v.created))} · ${esc(v.byName)}</small></span>${edit ? `<button class="btn small" data-restore="${esc(v.id)}">${t('Wiederherstellen')}</button>` : ''}</div>`).join('') : t('Noch keine Versionen.');
      } catch (e) { console.error(e); }
      return;
    }
    const links = data.links.filter(l => l.from === n.id || l.to === n.id).map(l => byId(l.from === n.id ? l.to : l.from)).filter(Boolean);
    const linkHtml = `<h3 style="margin-top:14px">${t('Verbindungen')}</h3><div class="links-list">${links.length ? links.map(o => `<div class="vrow"><span>${esc(o.name)}</span>${edit ? `<button data-unlink="${esc(o.id)}" aria-label="${t('Entfernen')}">×</button>` : ''}</div>`).join('') : `<span class="meta">${t('Keine')}</span>`}</div>`;
    if (!edit) {
      panel.innerHTML = `<h3>${esc(n.name)}</h3><p class="meta">${n.type === 'anchor' ? t('Anker (Nutzer)') : n.type === 'note' ? t('Notiz') : n.build ? t('Selbst bauen (Differenzierung)') : t('Standard, einkaufen')}</p>
        ${n.desc ? `<div class="ro">${esc(n.desc)}</div>` : ''}${linkHtml}`;
      return;
    }
    const comp = n.type === 'component';
    panel.innerHTML = `<h3>${t('Baustein')}</h3>
      <label>${t('Name')}<input data-f="name" id="f-name" value="${esc(n.name)}" maxlength="80"></label>
      <label>${t('Typ')}<select data-f="type">${opt(TYPES, n.type, v => ({ component: t('Baustein'), anchor: t('Anker (Nutzer)'), note: t('Notiz') }[v]))}</select></label>
      ${comp ? `<label>${t('Kategorie')}<select data-f="build">${opt(['std', 'diff'], n.build ? 'diff' : 'std', v => v === 'diff' ? t('Selbst bauen (Differenzierung)') : t('Standard, einkaufen'))}</select></label>` : ''}
      <label>${t('Beschriftung')}<select data-f="label">${opt(LABELS, n.label, v => ({ right: t('rechts'), left: t('links'), below: t('unten'), above: t('oben') }[v]))}</select></label>
      ${n.type !== 'note' ? `<label>${t('Entwicklung')}</label><div class="evo"><label class="chk" style="margin:0"><input type="checkbox" data-f="evoOn" ${typeof n.evo === 'number' ? 'checked' : ''}> ${t('Pfeil')}</label>
        <input type="range" data-f="evo" min="0" max="100" value="${Math.round((typeof n.evo === 'number' ? n.evo : n.x) * 100)}" ${typeof n.evo === 'number' ? '' : 'disabled'} aria-label="${t('Entwicklung')}"></div>` : ''}
      <label>${t('Beschreibung')}<textarea data-f="desc" rows="3" maxlength="500">${esc(n.desc)}</textarea></label>
      ${linkHtml}
      <button class="btn danger" style="margin-top:14px" data-act="del">${t('Baustein löschen')}</button>`;
  }

  panel.addEventListener('focusin', e => { if (edit && e.target.dataset && e.target.dataset.f) pushUndo(); });
  panel.addEventListener('input', e => {
    const f = e.target.dataset.f, n = sel && byId(sel);
    if (!edit || !f || !n) return;
    if (f === 'name') n.name = e.target.value.slice(0, 80);
    else if (f === 'desc') n.desc = e.target.value.slice(0, 500);
    else if (f === 'evo') n.evo = clamp(Math.max(Number(e.target.value) / 100, n.x + 0.02), 0, 1);
    else return;
    draw(); changed();
  });
  panel.addEventListener('change', e => {
    const f = e.target.dataset.f, n = sel && byId(sel);
    if (!edit || !f || !n) return;
    if (f === 'type') { n.type = TYPES.includes(e.target.value) ? e.target.value : 'component'; renderPanel(); }
    else if (f === 'build') n.build = e.target.value === 'diff';
    else if (f === 'label') n.label = LABELS.includes(e.target.value) ? e.target.value : 'right';
    else if (f === 'evoOn') { if (e.target.checked) n.evo = clamp(n.x + 0.15, 0, 1); else delete n.evo; renderPanel(); }
    else return;
    draw(); changed();
  });
  panel.addEventListener('click', async e => {
    if (!edit) return;
    const un = e.target.dataset.unlink, rs = e.target.dataset.restore;
    if (un && sel) { pushUndo(); data.links = data.links.filter(l => !((l.from === sel && l.to === un) || (l.to === sel && l.from === un))); draw(); renderPanel(); changed(); }
    else if (e.target.dataset.act === 'del' && sel) deleteNode(sel);
    else if (rs) {
      try {
        const d = await API.getVersionData(id, rs);
        pushUndo(); data = sanitize(d); sel = null; draw(); renderPanel(); changed(); toast(t('Version wiederhergestellt'));
      } catch (err) { fail(err); }
    }
  });

  function deleteNode(k) {
    pushUndo();
    data.nodes = data.nodes.filter(n => n.id !== k);
    data.links = data.links.filter(l => l.from !== k && l.to !== k);
    sel = null; draw(); renderPanel(); changed();
  }
  function doUndo(from, to) {
    if (!from.length) return;
    to.push(snap()); data = JSON.parse(from.pop());
    if (sel && !byId(sel)) sel = null;
    draw(); renderPanel(); changed(); syncBtns();
  }

  /* Canvas-Interaktion */
  host.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-node]'), pt = toSvg(e);
    if (!edit) { select(g ? g.dataset.node : null); return; }
    if (tool === 'add' && !g) {
      pushUndo();
      const n = { id: uid(), name: t('Neuer Baustein'), x: clamp(nx(pt.x), 0, 1), y: clamp(ny(pt.y), 0, 1), type: 'component', build: false, label: 'right', desc: '' };
      data.nodes.push(n); setTool('select'); select(n.id); changed();
      const f = $('#f-name'); if (f) { f.focus(); f.select(); }
      return;
    }
    if (tool === 'link') {
      if (!g) { linkFrom = null; draw(); return; }
      const k = g.dataset.node;
      if (!linkFrom) { linkFrom = k; sel = k; draw(); renderPanel(); }
      else if (linkFrom !== k) {
        pushUndo();
        const i = data.links.findIndex(l => (l.from === linkFrom && l.to === k) || (l.from === k && l.to === linkFrom));
        if (i >= 0) data.links.splice(i, 1); else data.links.push({ from: linkFrom, to: k });
        linkFrom = null; sel = k; draw(); renderPanel(); changed();
      }
      return;
    }
    if (g) {
      const k = g.dataset.node, n = byId(k);
      if (sel !== k) select(k);
      drag = { id: k, dx: pt.x - px(n.x), dy: pt.y - py(n.y), moved: false };
      try { host.setPointerCapture(e.pointerId); } catch (err) { /* ignorieren */ }
    } else select(null);
  });
  host.addEventListener('pointermove', e => {
    if (!drag) return;
    const pt = toSvg(e), n = byId(drag.id); if (!n) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    n.x = clamp(nx(pt.x - drag.dx), 0, 1);
    n.y = clamp(ny(pt.y - drag.dy), 0, 1);
    draw();
  });
  const endDrag = () => { if (drag && drag.moved) changed(); drag = null; };
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);

  const onKey = e => {
    if (!edit) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteNode(sel); }
    else if (e.key === 'Escape') { setTool('select'); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(undo, redo); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doUndo(redo, undo); }
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => { flush(); document.removeEventListener('keydown', onKey); cleanup = () => {}; };

  /* Toolbar */
  if (edit) {
    document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('#undo').onclick = () => doUndo(undo, redo);
    $('#redo').onclick = () => doUndo(redo, undo);
    $('#mt').addEventListener('input', e => { title = e.target.value.slice(0, 100); changed(); });
    $('#ver').onclick = () => {
      const md = modal(`<h2>${t('Version speichern')}</h2>
        <label>${t('Bezeichnung')}<input id="vlab" maxlength="80" placeholder="${t('z. B. Stand Q4')}" autofocus></label>
        <div class="foot"><button class="btn" data-close>${t('Abbrechen')}</button><button class="btn primary" id="ok">${t('Speichern')}</button></div>`);
      $('#ok', md.el).onclick = async () => {
        try { await flush(); await API.addVersion(id, $('#vlab', md.el).value); md.close(); toast(t('Version gespeichert')); if (!sel) renderPanel(); }
        catch (err) { fail(err); }
      };
    };
  }
  $('#exs').onclick = () => download(fileSafe(title) + '.svg', mapSvg(data, { id: 'x' }), 'image/svg+xml');
  $('#exj').onclick = () => download(fileSafe(title) + '.json', JSON.stringify({ title, data }, null, 2), 'application/json');

  syncBtns(); draw(); renderPanel();
  void panelKey;
}

/* ---------- Router und Start ---------- */
async function route() {
  cleanup();
  const u = API.me();
  if (!u) { renderLogin(); return; }
  shell(u);
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  try {
    if (parts[0] === 'map' && parts[1]) await viewDesigner(parts[1]);
    else if (parts[0] === 'admin') {
      if (!u.isAdmin) { location.hash = '#/library'; return; }
      await viewAdmin();
    } else await viewLibrary();
  } catch (e) {
    console.error(e);
    view().innerHTML = `<div class="card"><p>${esc(e.message || String(e))}</p><a href="#/library">${t('Zur Library')}</a></div>`;
  }
}

function registerSw() {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(e => console.error('SW', e));
  }
}
async function boot() {
  window.addEventListener('hashchange', route);
  registerSw();
  try { await API.init(); }
  catch (e) {
    console.error(e);
    $('#app').innerHTML = `<main><div class="card"><h2>${t('Start fehlgeschlagen')}</h2><p>${esc(e.message || String(e))}</p></div></main>`;
    return;
  }
  route();
}

if (typeof document !== 'undefined' && document.getElementById('app')) boot();
root.WM = { API, mapSvg, sanitize, teaTemplate, loadDb, CFG, makeSupabaseApi };

})(typeof window !== 'undefined' ? window : globalThis);
