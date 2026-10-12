-- =====================================================================
-- Wardley Maps – Supabase-Schema (idempotent, im SQL Editor ausführbar)
-- Tabellen, Row Level Security, Hilfsfunktionen und Admin-RPCs.
-- Reihenfolge: 1) schema.sql  2) seed.sql (erster Admin)
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Einstellungen (nur über security-definer-Funktionen lesbar)
-- email_domain muss mit EMAIL_DOMAIN in config.js übereinstimmen.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
insert into public.app_settings (key, value) values ('email_domain', 'wardley.app')
  on conflict (key) do nothing;
alter table public.app_settings enable row level security;

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------
-- Anmeldung mit Mobilnummer und PIN (wie FBRO). phone steht immer normalisiert
-- im internationalen Format (+41791234567). Die Nummer ist nur für Admins lesbar
-- (siehe Spaltenrechte am Ende und admin_list_users).
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  phone      text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  is_admin   boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Migration von früheren Versionen dieses Schemas
-- Frühere Version: Anmeldung mit Name (Spalte login_key). Jetzt: Mobilnummer (Spalte phone).
-- "create table if not exists" ändert eine bestehende Tabelle nicht, deshalb stellt dieser Block sie um:
--   - Personen aus dem alten Stand haben keine Mobilnummer. Sie bleiben samt Maps erhalten, werden aber
--     deaktiviert, verlieren die Admin-Rolle, bekommen eine Platzhalternummer (+99900000001, ...) und
--     ihr Login wird gesperrt. Im Admin-Tab lassen sie sich löschen, ihre Maps gehen dann an den löschenden Admin.
--   - Auf einer frischen Datenbank tut der Block nichts.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    if (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles'
           and column_name in ('id', 'name', 'is_admin', 'active', 'created_at')) < 5 then
      raise exception 'public.profiles stammt nicht aus diesem Schema (Spalten id, name, is_admin, active, created_at erwartet). Bitte prüfen, ob das Projekt zu dieser App gehört.';
    end if;

    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone') then
      alter table public.profiles add column phone text;
      update public.profiles p
         set phone = '+9990000' || lpad(r.n::text, 4, '0'), active = false, is_admin = false
        from (select id, row_number() over (order by created_at, id) as n from public.profiles) r
       where r.id = p.id;
      update auth.users set banned_until = 'infinity'::timestamptz
       where id in (select id from public.profiles);
      alter table public.profiles alter column phone set not null;
      alter table public.profiles add constraint profiles_phone_key unique (phone);
      alter table public.profiles add constraint profiles_phone_check check (phone ~ '^\+[1-9][0-9]{7,14}$');
    end if;

    alter table public.profiles drop column if exists login_key;
  end if;
end $$;
drop index if exists public.profiles_name_ci;

create table if not exists public.maps (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Neue Map',
  owner_id   uuid not null,
  data       jsonb not null default '{"nodes":[],"links":[]}'::jsonb,
  rev        integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maps_owner_id_fkey foreign key (owner_id) references public.profiles (id)
);
create index if not exists maps_owner_idx on public.maps (owner_id);

create table if not exists public.map_members (
  map_id  uuid not null references public.maps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role    text not null check (role in ('editor', 'viewer')),
  primary key (map_id, user_id)
);
create index if not exists map_members_user_idx on public.map_members (user_id);

create table if not exists public.map_versions (
  id         uuid primary key default gen_random_uuid(),
  map_id     uuid not null references public.maps (id) on delete cascade,
  label      text not null default '',
  data       jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint map_versions_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null
);
create index if not exists map_versions_map_idx on public.map_versions (map_id, created_at desc);

-- ---------------------------------------------------------------------
-- Mobilnummer normalisieren (muss mit normPhone() in app.js übereinstimmen)
--   079 123 45 67, +41 79 123 45 67, 0041 79 123 45 67, +41 (0)79 123 45 67
--   ergeben alle +41791234567. Andere Länder: +49 170 1234567 oder 0049 170 1234567.
--   Zu kurz oder ungültig ergibt null.
-- ---------------------------------------------------------------------
create or replace function public.normalize_phone(p text) returns text
language plpgsql immutable set search_path = public as $$
declare
  s text := coalesce(p, '');
begin
  s := replace(s, '(0)', '');
  s := regexp_replace(s, '[^0-9+]', '', 'g');
  if s like '00%' then
    s := '+' || substr(s, 3);
  elsif s like '0%' then
    s := '+41' || substr(s, 2);
  elsif s ~ '^41[0-9]{9}$' then
    s := '+' || s;
  end if;
  if s !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
  if s like '+41%' and length(s) <> 12 then return null; end if;
  return s;
end $$;

-- ---------------------------------------------------------------------
-- Hilfsfunktionen für Rechte (security definer, umgehen RLS bewusst)
-- ---------------------------------------------------------------------
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.active from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin and p.active from public.profiles p where p.id = auth.uid()), false)
$$;

-- Rolle der aufrufenden Person auf einer Map: admin, owner, editor, viewer oder null
create or replace function public.map_role(p_map uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not public.is_active() then null
    when public.is_admin() then 'admin'
    when m.owner_id = auth.uid() then 'owner'
    else (select mm.role from public.map_members mm where mm.map_id = m.id and mm.user_id = auth.uid())
  end
  from public.maps m where m.id = p_map
$$;

create or replace function public.can_read(p_map uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.map_role(p_map) is not null
$$;

create or replace function public.can_edit(p_map uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.map_role(p_map) in ('admin', 'owner', 'editor'), false)
$$;

create or replace function public.can_manage(p_map uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.map_role(p_map) in ('admin', 'owner'), false)
$$;

-- ---------------------------------------------------------------------
-- Trigger: Datenprüfung, Revision, Besitzerschutz
-- ---------------------------------------------------------------------
create or replace function public.maps_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(new.data -> 'nodes') is distinct from 'array'
     or jsonb_typeof(new.data -> 'links') is distinct from 'array' then
    raise exception 'Ungültige Map-Daten';
  end if;
  if pg_column_size(new.data) > 2000000 then
    raise exception 'Map zu gross';
  end if;
  new.title := left(btrim(new.title), 100);
  if new.title = '' then new.title := 'Neue Map'; end if;
  if tg_op = 'UPDATE' then
    if new.owner_id <> old.owner_id and not public.can_manage(old.id) then
      raise exception 'Besitzer nicht änderbar';
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
    new.rev := old.rev + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists maps_guard_trg on public.maps;
create trigger maps_guard_trg before insert or update on public.maps
  for each row execute function public.maps_guard();

create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id = (select m.owner_id from public.maps m where m.id = new.map_id) then
    raise exception 'Besitzer braucht keine Mitgliedschaft';
  end if;
  return new;
end $$;

drop trigger if exists members_guard_trg on public.map_members;
create trigger members_guard_trg before insert or update on public.map_members
  for each row execute function public.members_guard();

-- Pro Map höchstens 50 Versionen behalten
create or replace function public.versions_prune() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.map_versions v
   where v.map_id = new.map_id
     and v.id in (
       select id from public.map_versions
        where map_id = new.map_id
        order by created_at desc offset 50
     );
  return null;
end $$;

drop trigger if exists versions_prune_trg on public.map_versions;
create trigger versions_prune_trg after insert on public.map_versions
  for each row execute function public.versions_prune();

-- ---------------------------------------------------------------------
-- Row Level Security (auf jeder Tabelle aktiv)
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.maps         enable row level security;
alter table public.map_members  enable row level security;
alter table public.map_versions enable row level security;

-- profiles: lesen für aktive Personen, Schreiben nur über RPCs
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_active());

-- maps
drop policy if exists maps_select on public.maps;
-- Die Besitzer-Bedingung steht direkt an der Zeile: bei INSERT ... RETURNING sieht
-- can_read() die neue Zeile noch nicht (gleicher Snapshot).
create policy maps_select on public.maps for select to authenticated
  using ((owner_id = auth.uid() and public.is_active()) or public.can_read(id));

drop policy if exists maps_insert on public.maps;
create policy maps_insert on public.maps for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active());

drop policy if exists maps_update on public.maps;
create policy maps_update on public.maps for update to authenticated
  using (public.can_edit(id)) with check (public.can_edit(id));

drop policy if exists maps_delete on public.maps;
create policy maps_delete on public.maps for delete to authenticated
  using (public.can_manage(id));

-- map_members: lesen wer die Map sehen darf, ändern nur Besitzer oder Admin
drop policy if exists members_select on public.map_members;
create policy members_select on public.map_members for select to authenticated
  using (public.can_read(map_id));

drop policy if exists members_write on public.map_members;
create policy members_write on public.map_members for all to authenticated
  using (public.can_manage(map_id)) with check (public.can_manage(map_id));

-- map_versions
drop policy if exists versions_select on public.map_versions;
create policy versions_select on public.map_versions for select to authenticated
  using (public.can_read(map_id));

drop policy if exists versions_insert on public.map_versions;
create policy versions_insert on public.map_versions for insert to authenticated
  with check (public.can_edit(map_id) and created_by = auth.uid());

drop policy if exists versions_delete on public.map_versions;
create policy versions_delete on public.map_versions for delete to authenticated
  using (public.can_manage(map_id));

-- ---------------------------------------------------------------------
-- Interne Funktion: Person samt Login anlegen (nicht öffentlich aufrufbar)
-- Login = Mobilnummer + PIN. Ohne Angabe ist die PIN die letzten 6 Ziffern der Nummer.
-- Wichtig: Token-Spalten in auth.users mit '' setzen, nie NULL,
-- sonst schlägt der Login fehl.
-- ---------------------------------------------------------------------
drop function if exists public._create_user(text, text, boolean);

create or replace function public._create_user(p_name text, p_phone text, p_pin text, p_is_admin boolean)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id     uuid := gen_random_uuid();
  v_name   text := btrim(coalesce(p_name, ''));
  v_phone  text := public.normalize_phone(p_phone);
  v_pin    text;
  v_domain text;
  v_email  text;
begin
  if v_name = '' or char_length(v_name) > 40 then
    raise exception 'Name ungültig';
  end if;
  if v_phone is null then
    raise exception 'Mobilnummer ungültig';
  end if;
  v_pin := coalesce(nullif(btrim(coalesce(p_pin, '')), ''), right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 6));
  if v_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN: 6 Ziffern';
  end if;
  if exists (select 1 from public.profiles where phone = v_phone) then
    raise exception 'Mobilnummer ist bereits registriert';
  end if;
  select value into v_domain from public.app_settings where key = 'email_domain';
  v_email := ltrim(v_phone, '+') || '@' || coalesce(v_domain, 'wardley.app');

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token, phone_change, phone_change_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(v_pin, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.profiles (id, name, phone, is_admin)
  values (v_id, v_name, v_phone, coalesce(p_is_admin, false));

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Admin-RPCs (prüfen die Rolle serverseitig)
-- ---------------------------------------------------------------------
drop function if exists public.admin_create_user(text, text, boolean);
drop function if exists public.admin_reset_pin(uuid, text);

create or replace function public.admin_list_users()
returns table (id uuid, name text, phone text, is_admin boolean, active boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins'; end if;
  return query
    select p.id, p.name, p.phone, p.is_admin, p.active, p.created_at
      from public.profiles p order by lower(p.name);
end $$;

create or replace function public.admin_create_user(p_name text, p_phone text, p_pin text default null, p_is_admin boolean default false)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins'; end if;
  return public._create_user(p_name, p_phone, p_pin, p_is_admin);
end $$;

create or replace function public.admin_set_user_flags(p_user uuid, p_is_admin boolean, p_active boolean)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins'; end if;
  if p_user = auth.uid() and (not p_is_admin or not p_active) then
    raise exception 'Eigene Rechte nicht entziehbar';
  end if;
  update public.profiles set is_admin = p_is_admin, active = p_active where id = p_user;
  if not found then raise exception 'Benutzer nicht gefunden'; end if;
  update auth.users
     set banned_until = case when p_active then null else 'infinity'::timestamptz end
   where id = p_user;
  if not exists (select 1 from public.profiles where is_admin and active) then
    raise exception 'Mindestens ein aktiver Admin nötig';
  end if;
end $$;

-- PIN zurücksetzen: ohne Angabe auf die letzten 6 Ziffern der Mobilnummer
create or replace function public.admin_reset_pin(p_user uuid, p_pin text default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_phone text;
  v_pin   text;
begin
  if not public.is_admin() then raise exception 'Nur für Admins'; end if;
  select phone into v_phone from public.profiles where id = p_user;
  if v_phone is null then raise exception 'Benutzer nicht gefunden'; end if;
  v_pin := coalesce(nullif(btrim(coalesce(p_pin, '')), ''), right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 6));
  if v_pin !~ '^[0-9]{6}$' then raise exception 'PIN: 6 Ziffern'; end if;
  update auth.users set encrypted_password = crypt(v_pin, gen_salt('bf')), updated_at = now()
   where id = p_user;
end $$;

create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins'; end if;
  if p_user = auth.uid() then raise exception 'Eigenes Konto nicht löschbar'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Benutzer nicht gefunden';
  end if;
  update public.maps set owner_id = auth.uid() where owner_id = p_user;
  delete from auth.users where id = p_user;
  if not exists (select 1 from public.profiles where is_admin and active) then
    raise exception 'Mindestens ein aktiver Admin nötig';
  end if;
end $$;

-- Mitglieder einer Map atomar ersetzen: p_members = {"<user-uuid>": "editor"|"viewer"}
create or replace function public.set_map_members(p_map uuid, p_members jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v text;
begin
  if not public.can_manage(p_map) then raise exception 'Nur Besitzer oder Admin'; end if;
  delete from public.map_members where map_id = p_map;
  for k, v in select * from jsonb_each_text(coalesce(p_members, '{}'::jsonb)) loop
    continue when v not in ('editor', 'viewer')
      or k !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    insert into public.map_members (map_id, user_id, role)
    select p_map, k::uuid, v
     where exists (select 1 from public.profiles p where p.id = k::uuid)
       and k::uuid <> (select m.owner_id from public.maps m where m.id = p_map)
    on conflict (map_id, user_id) do update set role = excluded.role;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Rechte: anon bekommt nichts, authenticated nur das Nötige.
-- Die Mobilnummer (phone) ist für authenticated nicht lesbar, nur über admin_list_users().
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on public.app_settings from authenticated;

grant usage on schema public to authenticated;
revoke all on public.profiles from authenticated;
grant select (id, name, is_admin, active, created_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.maps, public.map_members, public.map_versions to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public._create_user(text, text, text, boolean) from authenticated;
grant execute on function
  public.is_active(), public.is_admin(), public.map_role(uuid),
  public.can_read(uuid), public.can_edit(uuid), public.can_manage(uuid),
  public.admin_list_users(),
  public.admin_create_user(text, text, text, boolean),
  public.admin_set_user_flags(uuid, boolean, boolean),
  public.admin_reset_pin(uuid, text),
  public.admin_delete_user(uuid),
  public.set_map_members(uuid, jsonb)
to authenticated;
