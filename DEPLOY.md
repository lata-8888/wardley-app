# Einrichtung und Deployment

Aufbau wie bei FBRO: zwei Umgebungen (DEV und PRD), je ein GitHub-Repository und ein eigenes
Supabase-Projekt. Änderungen immer zuerst in DEV testen, dann in PRD ausrollen.

| | DEV | PRD |
|---|---|---|
| GitHub-Repo | `<user>/wardley-dev` | `<org>/wardley-app` |
| Supabase-Projekt | eigenes DEV-Projekt | eigenes PRD-Projekt |
| URL | `<user>.github.io/wardley-dev/` | `<org>.github.io/wardley-app/` |

Der Code ist in beiden Repositories identisch. Nur die drei Repository-Variablen unterscheiden die Umgebung.
Es gibt keine eigene Konfigurationsdatei im Repo, `config.js` entsteht beim Deployment.

## 1. Supabase-Projekt einrichten (pro Umgebung einmal)

1. Neues Projekt anlegen (Region nahe bei den Nutzern, zum Beispiel Zürich oder Frankfurt).
2. SQL Editor: Inhalt von `supabase/schema.sql` ausführen. Das Skript ist idempotent und darf bei
   Änderungen erneut laufen.
3. SQL Editor: `supabase/seed.sql` ausführen. Vorher Name und PIN des ersten Admins anpassen.
   Das legt die Person inklusive Login an. Die Token-Spalten in `auth.users` werden dabei mit `''`
   gesetzt, nie mit `NULL`, sonst schlägt der Login fehl.
4. Authentication > Sign In / Providers: Öffentliche Registrierung ausschalten ("Allow new users to sign up"
   aus). Personen entstehen nur über den Admin-Tab. Ohne Profil hätte ein selbst registriertes Konto
   zwar keinen Zugriff, abschalten ist trotzdem sauberer.
5. Project Settings > API: Project URL und den öffentlichen Key (anon bzw. publishable) notieren.
   Den service_role-Key (oder `sb_secret_...`) nie ins Repository oder in Variablen eintragen.

Anmeldung: Name und PIN werden auf eine E-Mail-Adresse abgebildet (`<name in a-z0-9>@<EMAIL_DOMAIN>`),
genau wie bei FBRO. Aus "Anna Müller" wird `annamller@wardley.app`. Umlaute und Sonderzeichen fallen weg,
deshalb sollte jeder Name mindestens einen Buchstaben a–z oder eine Ziffer enthalten und sich von den anderen
unterscheiden.

`EMAIL_DOMAIN` (Standard `wardley.app`) muss in zwei Stellen gleich sein:
Repository-Variable `EMAIL_DOMAIN` und Tabelle `app_settings` (`email_domain`) in der Datenbank.
Vor dem Anlegen der ersten Person ändern, falls eine andere Domain gewünscht ist:

    update public.app_settings set value = 'meine-domain.ch' where key = 'email_domain';

## 2. GitHub-Repository einrichten (pro Umgebung einmal)

1. Neues Repository anlegen und den Inhalt dieses Ordners pushen (Branch `main`).
2. Settings > Pages > Build and deployment > Source: **GitHub Actions**.
3. Settings > Secrets and variables > Actions > Tab **Variables** (nicht Secrets):

   | Variable | Wert |
   |---|---|
   | `SUPABASE_URL` | Project URL, zum Beispiel `https://abcd1234.supabase.co` |
   | `SUPABASE_ANON_KEY` | öffentlicher anon- oder publishable-Key |
   | `EMAIL_DOMAIN` | zum Beispiel `wardley.app` |

4. Push auf `main` startet den Workflow `Deploy`: erst `scripts/check.js`, dann `scripts/build.js` und
   das Veröffentlichen auf GitHub Pages. Der Build bricht ab, wenn der Key nach service_role aussieht.
5. Pull Requests und andere Branches laufen durch den Workflow `CI` (nur Prüfungen und Test-Build).

Was der Build zusätzlich tut: Er schreibt `dist/config.js` aus den Variablen, hängt die Commit-ID an den
Cache-Namen des Service Workers (jedes Deployment bekommt einen frischen Cache) und fügt eine
Content-Security-Policy in `dist/index.html` ein. Die CSP erlaubt Skripte nur von der eigenen Domain und
`cdn.jsdelivr.net`, Verbindungen nur zur eigenen Domain und zur Supabase-URL.

## 3. Checkliste vor jedem Deployment

Angelehnt an die FBRO-Checkliste. `node scripts/check.js` deckt die statischen Punkte ab.

- [ ] Zuerst DEV, dann PRD. Nie die Variablen der beiden Umgebungen verwechseln.
- [ ] `node scripts/check.js` läuft grün (Syntax, SHELL-Dateien, Icons, RLS auf jeder Tabelle,
      Tabellen und RPCs aus `app.js` existieren im Schema, Admin-RPCs prüfen `is_admin()`, keine Secret-Keys).
- [ ] Neue Tabelle oder Spalte: `supabase/schema.sql` ändern (idempotent halten), RLS aktivieren, Policies schreiben,
      im SQL Editor von DEV ausführen und testen, dann PRD.
- [ ] Neue Admin-Aktion: Guard im Client und serverseitige Prüfung in der RPC oder Policy.
- [ ] Neue Texte laufen über `t()`. Weitere Sprachen kommen in `DICT` in `app.js`.
- [ ] Neue Shell-Datei: in `SHELL` in `sw.js` eintragen und im `build.js` kopieren lassen.
- [ ] Bei Änderungen an `sw.js`, `app.js`, `styles.css` oder `index.html` die Konstante `CACHE` in `sw.js`
      erhöhen (der Build hängt zusätzlich die Commit-ID an).
- [ ] Externe Bibliotheken: nur von `cdn.jsdelivr.net`. `supabase-js` ist auf Major-Version 2 gepinnt;
      bei Bedarf auf eine feste Version setzen und bei Versionswechsel auf bekannte Schwachstellen prüfen.
- [ ] Nach dem Deployment einmal live einloggen (Admin und eine normale Person), eine Map anlegen,
      speichern, teilen, Version speichern.
- [ ] PWA unter Android prüfen (Android 8+ mit Chrome 68+ empfohlen).

## 4. Regressionstest (manuell, nach jeder Änderung)

- Login mit richtiger und falscher PIN, Logout.
- Library: Map anlegen (leer und Vorlage), duplizieren, teilen, löschen, JSON-Import.
- Designer: Baustein setzen, verschieben, verbinden, Entwicklungspfeil, Undo und Redo, Autosave,
  Version speichern und wiederherstellen, Export SVG und JSON.
- Rechte: Leser kann nichts ändern, Bearbeiter kann nicht teilen oder löschen, fremde Maps sind unsichtbar.
- Admin: Person anlegen, Admin-Rolle ändern, deaktivieren (Login schlägt danach fehl), PIN zurücksetzen,
  löschen (Maps gehen an die löschende Person über).

## 5. Fehlersuche

| Symptom | Ursache und Lösung |
|---|---|
| "Name oder PIN falsch" trotz richtiger Daten | Passt `EMAIL_DOMAIN` zu `app_settings`? In `auth.users` prüfen: `select email from auth.users limit 5;`. Sind die Token-Spalten `''` statt `NULL`? |
| Start zeigt "config.js unvollständig" | Repository-Variablen fehlen oder sind leer, Deployment neu auslösen |
| Alte Version nach dem Deployment | Service Worker cached `config.js` und die Shell: hart neu laden (Strg+Shift+R) oder Service Worker unregistern |
| Karte lässt sich nicht speichern | Rolle prüfen (Leser?), Konsole auf RLS-Fehler ansehen, `schema.sql` in dieser Umgebung ausgeführt? |
| Login-Fehler genauer ansehen | Network-Tab > `token?grant_type=password` > Payload: welche E-Mail sendet die App? |

## 6. Update-Anleitung (Vorlage für die Ausgabe nach einem Deployment)

    Umgebung: [DEV / PRD]
    Update-Anleitung:
    1. Änderungen nach main pushen (Workflow "Deploy" läuft)
    2. Falls schema.sql geändert: im SQL Editor der Umgebung ausführen (idempotent)
    3. Seite hart neu laden (Strg+Shift+R)

    Was wurde geändert: [1–3 Sätze]
