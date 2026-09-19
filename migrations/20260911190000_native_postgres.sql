-- Application-owned identity and authorization for stock PostgreSQL.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  encrypted_password text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  banned_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists app_users_email_unique on app_users(lower(email));

do $$
begin
  if to_regclass('auth.users') is not null then
    insert into app_users (id, email, encrypted_password, raw_user_meta_data, banned_until, deleted_at, created_at, updated_at)
    select id, email, encrypted_password, coalesce(raw_user_meta_data, '{}'::jsonb), banned_until, deleted_at, created_at, updated_at
      from auth.users
     where email is not null and encrypted_password is not null
    on conflict (id) do update set
      email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      raw_user_meta_data = excluded.raw_user_meta_data,
      banned_until = excluded.banned_until,
      deleted_at = excluded.deleted_at,
      updated_at = excluded.updated_at;
  end if;
end $$;

do $$
declare item record;
begin
  if to_regclass('auth.users') is not null then
    for item in
      select n.nspname as schema_name, t.relname as table_name, c.conname,
             replace(pg_get_constraintdef(c.oid), 'auth.users', 'app_users') as definition
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public'
    loop
      execute format('alter table %I.%I drop constraint %I', item.schema_name, item.table_name, item.conname);
      execute format('alter table %I.%I add constraint %I %s', item.schema_name, item.table_name, item.conname, item.definition);
    end loop;
  end if;
end $$;

create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text
);
create index if not exists app_sessions_user_idx on app_sessions(user_id);
create index if not exists app_sessions_expiry_idx on app_sessions(expires_at);

create table if not exists app_password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists app_password_resets_expiry_idx on app_password_resets(expires_at);

do $$
declare item record;
begin
  for item in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I', item.policyname, item.schemaname, item.tablename);
  end loop;
  for item in
    select c.oid::regclass as table_name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('alter table %s disable row level security', item.table_name);
  end loop;
end $$;

drop function if exists public.is_super_admin();
drop function if exists public.my_agent_ids();
drop function if exists public.my_agent_names();
drop function if exists public.my_contract_ids();
drop function if exists public.visible_agent_ids();

drop publication if exists supabase_realtime;
