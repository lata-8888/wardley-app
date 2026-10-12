# Wardley Maps

Wardley Maps erstellen, verwalten und pflegen. PWA mit Vanilla JS (kein Build-Schritt für die App selbst),
Supabase als Backend und GitHub Pages als Hosting. Aufbau wie FBRO.

Zwei Betriebsarten, gesteuert über `config.js`:

| Modus | `BACKEND` | Daten | Zweck |
|---|---|---|---|
| lokal | `'local'` (Standard im Repo) | `localStorage` im Browser | Ausprobieren ohne Server |
| Supabase | `'supabase'` | Postgres mit Row Level Security | Mehrere Personen, echte Rechte |

Im Supabase-Modus erzeugt der Build `config.js` automatisch aus den GitHub-Variablen.
Die Anleitung dazu steht in **DEPLOY.md**.

## Lokal starten

    python3 -m http.server 8080      # oder: npm run serve

Dann `http://localhost:8080` öffnen. Demo-Logins im lokalen Modus (Name / PIN):

| Name | PIN | Rolle |
|---|---|---|
| Admin | 1234 | Admin |
| Anna | 1111 | Bearbeiterin der Beispiel-Map |
| Ben | 2222 | Leser der Beispiel-Map |

Gegen ein Supabase-Projekt lokal testen: `config.example.js` als `config.js` speichern und ausfüllen.
Diese Datei nicht committen.

## Module

- Library: Karten mit Vorschau, Suche, Neu (leer oder Teeshop-Vorlage), Duplizieren, Teilen, Löschen, JSON-Import.
- Designer: Bausteine setzen und verschieben, Verbinden, Entwicklungspfeile, Beschriftungsposition,
  Undo und Redo (Strg+Z, Strg+Y), Autosave, Versionen mit Wiederherstellung, Export als SVG und JSON.
- Admin: Personen anlegen, Admin-Rolle vergeben, aktivieren oder deaktivieren, PIN zurücksetzen, löschen.

Rechte pro Map: Besitzer, Bearbeiter, Leser. Admins sehen und verwalten alles.

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `index.html`, `app.js`, `styles.css` | Die App. `app.js` enthält `LocalApi` und die Supabase-Schicht hinter derselben Schnittstelle |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA |
| `config.js` | Lokale Standardkonfiguration (im Repo ohne Zugangsdaten) |
| `config.example.js` | Vorlage für Supabase |
| `supabase/schema.sql` | Tabellen, Row Level Security, Trigger, Admin-RPCs (idempotent) |
| `supabase/seed.sql` | Erster Admin |
| `scripts/check.js` | Statische Prüfungen (Syntax, SHELL, RLS, Tabellen und RPCs, Secrets) |
| `scripts/build.js` | Baut `dist/`: `config.js` aus Variablen, SW-Cache-ID, Content-Security-Policy |
| `.github/workflows/ci.yml` | Prüfungen bei Pull Requests und Branches |
| `.github/workflows/deploy.yml` | Prüfen, bauen und auf GitHub Pages veröffentlichen |
| `DEPLOY.md` | Einrichtung, Checkliste, Regressionstest, Fehlersuche |

## Datenmodell

- `profiles` (Name, Login-Schlüssel, Admin, aktiv), verknüpft mit `auth.users`
- `maps` mit `data jsonb` (Nodes, Links, Entwicklungspfeile), Besitzer, Revisionsnummer
- `map_members` (Bearbeiter oder Leser pro Map)
- `map_versions` (Snapshots, höchstens 50 pro Map)

Rechte werden in der Datenbank durchgesetzt (RLS und `security definer`-Funktionen), nicht nur im Client.
Personen anlegen, PIN zurücksetzen, Rollen ändern und löschen laufen über RPCs, die `is_admin()` prüfen.

## Bekannte Grenzen

- Kein Zoom und Pan im Designer, keine Mehrfachauswahl.
- Kein Konfliktschutz bei gleichzeitigem Bearbeiten derselben Map: wer zuletzt speichert, gewinnt.
  Die Spalte `rev` ist dafür vorbereitet.
- Nur Deutsch. Texte laufen über `t()`, weitere Sprachen kommen in `DICT`.
- Im lokalen Modus liegen PINs im Klartext im Browser. Mit Supabase übernimmt Auth das Hashing.
