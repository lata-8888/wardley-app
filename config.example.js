// Vorlage für eine Supabase-Umgebung (DEV oder PRD).
// Beim GitHub-Deployment wird config.js automatisch aus den Repository-Variablen
// SUPABASE_URL, SUPABASE_ANON_KEY und EMAIL_DOMAIN erzeugt (scripts/build.js).
// Für lokales Testen gegen Supabase: diese Datei als config.js speichern und ausfüllen.
//
// Regeln:
// - Nur der öffentliche anon- bzw. publishable-Key gehört hierher, niemals der service_role-Key.
// - EMAIL_DOMAIN muss mit app_settings.email_domain in der Datenbank übereinstimmen
//   (Standard: wardley.app, siehe supabase/schema.sql).
window.APP_CONFIG = {
  BACKEND: 'supabase',
  APP_NAME: 'Wardley Maps',
  SUPABASE_URL: 'https://DEIN-PROJEKT.supabase.co',
  SUPABASE_ANON_KEY: 'DEIN-ANON-KEY',
  EMAIL_DOMAIN: 'wardley.app'
};
