-- Piezas mínimas de Supabase para probar el SQL del proyecto en un Postgres común (por ejemplo, en GitHub Actions).
-- NO se ejecuta en Supabase: allá ya existen. Imita lo que importa para las pruebas:
--   * los roles anon, authenticated y service_role;
--   * auth.uid() (aquí lee la variable request.jwt.claim.sub);
--   * storage.buckets y storage.objects con RLS;
--   * los permisos por defecto de Supabase: anon y authenticated reciben acceso a todo lo que se crea en "public",
--     y es el RLS (y los REVOKE del proyecto) lo que realmente protege los datos.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;

create table auth.users (id uuid primary key default gen_random_uuid());

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert on storage.objects to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
