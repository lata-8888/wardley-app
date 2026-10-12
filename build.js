#!/usr/bin/env node
'use strict';
/* Baut den Ordner dist/ für GitHub Pages.
   - kopiert die Shell-Dateien
   - schreibt config.js aus den Umgebungsvariablen SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMAIN
   - hängt die Commit-ID an die Service-Worker-Cache-Version (neuer Cache bei jedem Deployment)
   - fügt in dist/index.html eine Content-Security-Policy ein
   Ohne SUPABASE_URL entsteht ein Build im lokalen Modus (Daten nur im Browser). */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
const env = n => String(process.env[n] || '').trim();
const die = m => { console.error('build: ' + m); process.exit(1); };

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
['index.html', 'styles.css', 'app.js', 'i18n.js', 'sw.js', 'manifest.webmanifest'].forEach(f => fs.copyFileSync(path.join(root, f), path.join(out, f)));
fs.cpSync(path.join(root, 'icons'), path.join(out, 'icons'), { recursive: true });
fs.cpSync(path.join(root, 'fonts'), path.join(out, 'fonts'), { recursive: true });

const url = env('SUPABASE_URL').replace(/\/+$/, '');
const key = env('SUPABASE_ANON_KEY');
const domain = env('EMAIL_DOMAIN') || 'wardley.app';

let config;
let connect = "'self'";
if (url) {
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(url)) die('SUPABASE_URL muss wie https://<projekt>.supabase.co aussehen');
  if (!key) die('SUPABASE_ANON_KEY fehlt');
  if (/^sb_secret_/.test(key)) die('SUPABASE_ANON_KEY enthält einen Secret-Key (sb_secret_). Nur den öffentlichen Key verwenden.');
  if (key.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      if (payload.role && payload.role !== 'anon') die('SUPABASE_ANON_KEY hat die Rolle "' + payload.role + '". Nur den anon-Key verwenden.');
    } catch (e) { die('SUPABASE_ANON_KEY ist kein lesbares JWT'); }
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) die('EMAIL_DOMAIN ungültig');
  config = { BACKEND: 'supabase', APP_NAME: 'Wardley Maps', SUPABASE_URL: url, SUPABASE_ANON_KEY: key, EMAIL_DOMAIN: domain };
  connect += ' ' + url + ' ' + url.replace(/^https:/, 'wss:');
} else {
  console.warn('build: SUPABASE_URL nicht gesetzt, es entsteht ein Build im lokalen Modus');
  config = { BACKEND: 'local', APP_NAME: 'Wardley Maps' };
}
fs.writeFileSync(path.join(out, 'config.js'), 'window.APP_CONFIG = ' + JSON.stringify(config, null, 2) + ';\n');

const sha = env('GITHUB_SHA').slice(0, 7);
if (sha) {
  const p = path.join(out, 'sw.js');
  const s = fs.readFileSync(p, 'utf8');
  const n = s.replace(/const CACHE = '(wardley-v\d+)'/, "const CACHE = '$1-" + sha + "'");
  if (n === s) die('CACHE-Konstante in sw.js nicht gefunden');
  fs.writeFileSync(p, n);
}

const csp = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  'connect-src ' + connect,
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');
const hp = path.join(out, 'index.html');
const h = fs.readFileSync(hp, 'utf8');
const hn = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="' + csp + '">');
if (hn === h) die('Charset-Meta in index.html nicht gefunden');
fs.writeFileSync(hp, hn);

console.log('build: dist/ fertig (' + config.BACKEND + (sha ? ', ' + sha : '') + ')');
