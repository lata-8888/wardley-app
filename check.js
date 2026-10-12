#!/usr/bin/env node
'use strict';
/* Statische Prüfungen vor jedem Deployment (angelehnt an die FBRO-Checkliste).
   Aufruf: node scripts/check.js   – beendet mit Exit-Code 1, wenn etwas fehlt. */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
let failed = 0;
const ok = m => console.log('  ok    ' + m);
const bad = m => { failed++; console.error('  FEHLER ' + m); };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const exists = f => fs.existsSync(path.join(root, f));
const check = (cond, okMsg, badMsg) => (cond ? ok(okMsg) : bad(badMsg));

console.log('Syntax');
['app.js', 'i18n.js', 'sw.js', 'config.js', 'config.example.js', 'scripts/build.js', 'scripts/check.js'].forEach(f => {
  try { cp.execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }); ok(f); }
  catch (e) { bad(f + ': ' + String(e.stderr || e.message).split('\n')[0]); }
});

console.log('PWA und Service Worker');
const sw = read('sw.js');
const shell = [...(sw.split('const SHELL = [')[1] || '').split('];')[0].matchAll(/'([^']+)'/g)].map(m => m[1]);
check(shell.length > 0, 'SHELL gelesen (' + shell.length + ' Einträge)', 'SHELL in sw.js nicht gefunden');
shell.filter(f => f !== './').forEach(f => check(exists(f), 'SHELL-Datei ' + f, 'SHELL-Datei fehlt: ' + f));
check(/const CACHE = 'wardley-v\d+'/.test(sw), 'CACHE-Version vorhanden', "CACHE-Konstante 'wardley-vN' fehlt");
check(/skipWaiting\(\)/.test(sw) && /clients\.claim\(\)/.test(sw), 'skipWaiting und clients.claim', 'skipWaiting oder clients.claim fehlt');
const manifest = JSON.parse(read('manifest.webmanifest'));
check(manifest.start_url && manifest.display === 'standalone', 'Manifest: start_url und display', 'Manifest: start_url oder display fehlt');
check(manifest.id !== '/', 'Manifest: id nicht "/"', 'Manifest: id darf nicht "/" sein (GitHub-Pages-Unterpfad)');
(manifest.icons || []).forEach(i => check(exists(i.src), 'Icon ' + i.src, 'Icon fehlt: ' + i.src));
check((manifest.icons || []).some(i => i.sizes === '192x192'), 'Icon 192', 'Icon 192x192 fehlt');
check((manifest.icons || []).some(i => i.sizes === '512x512' && i.purpose === 'maskable'), 'Icon 512 maskable', 'maskable 512er Icon fehlt');

console.log('Datenbank');
const schema = read('supabase/schema.sql');
const tables = [...schema.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]);
const funcs = [...schema.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]);
tables.forEach(tb => check(new RegExp('alter table public\\.' + tb + '\\s+enable row level security').test(schema), 'RLS aktiv: ' + tb, 'RLS fehlt auf Tabelle ' + tb));
const app = read('app.js');
[...new Set([...app.matchAll(/\.from\('(\w+)'\)/g)].map(m => m[1]))].forEach(tb => check(tables.includes(tb), 'app.js nutzt Tabelle ' + tb, 'Tabelle fehlt im Schema: ' + tb));
[...new Set([...app.matchAll(/\.rpc\('(\w+)'/g)].map(m => m[1]))].forEach(fn => check(funcs.includes(fn), 'app.js nutzt RPC ' + fn, 'RPC fehlt im Schema: ' + fn));
funcs.filter(f => f.startsWith('admin_')).forEach(f => {
  const body = (schema.split('function public.' + f)[1] || '').split('end $$;')[0];
  check(body.includes('public.is_admin()'), 'Admin-RPC prüft serverseitig: ' + f, 'Admin-RPC ohne is_admin()-Prüfung: ' + f);
});
check(!/grant execute[^;]*public\._create_user[^;]*to authenticated/i.test(schema), '_create_user nicht für authenticated freigegeben', '_create_user darf nicht für authenticated freigegeben sein');
check(/grant select \(id, name, is_admin, active, created_at\) on public\.profiles/.test(schema) && /revoke all on public\.profiles from authenticated/.test(schema),
  'Mobilnummer nur für Admins lesbar (Spaltenrechte auf profiles)', 'profiles: Spaltenrechte ohne phone fehlen, Mobilnummern wären für alle lesbar');
check(funcs.includes('normalize_phone') && /function normPhone\(/.test(app), 'normalize_phone (SQL) und normPhone (JS) vorhanden', 'normalize_phone oder normPhone fehlt');

console.log('Sicherheit');
['app.js', 'i18n.js', 'sw.js', 'config.js', 'config.example.js', 'index.html'].forEach(f => {
  const s = read(f).replace(/\/\/.*$/gm, '');
  check(!/service_role|sb_secret_/.test(s), 'Kein Secret-Key in ' + f, 'service_role oder sb_secret_ in ' + f);
});
check(!/console\.log\(/.test(app), 'Kein console.log in app.js', 'console.log in app.js (Debug-Ausgaben entfernen)');
check(!/catch\s*(\(\w*\))?\s*\{\s*\}/.test(app), 'Keine leeren catch-Blöcke', 'Leerer catch-Block in app.js (console.error ergänzen)');
const html = read('index.html');
const srcs = [...html.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map(m => m[1]);
srcs.forEach(u => check(/^https:\/\/cdn\.jsdelivr\.net\//.test(u), 'CDN erlaubt: ' + u, 'CDN nicht erlaubt (nur cdn.jsdelivr.net): ' + u));
[...html.matchAll(/href="(icons\/[^"]+)"/g)].forEach(m => check(exists(m[1]), 'index.html verweist auf ' + m[1], 'Icon aus index.html fehlt: ' + m[1]));
check(/apple-touch-icon/.test(html), 'apple-touch-icon eingebunden', 'apple-touch-icon fehlt in index.html');
const cfg = read('config.js');
check(/BACKEND:\s*'local'/.test(cfg) && !/SUPABASE_ANON_KEY/.test(cfg), 'config.js im Repo ist die lokale Standardkonfiguration', 'config.js im Repo darf keine Supabase-Zugangsdaten enthalten');

console.log(failed ? '\n' + failed + ' Fehler' : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
