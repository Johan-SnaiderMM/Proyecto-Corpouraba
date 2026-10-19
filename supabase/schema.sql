-- Esquema del prototipo de reporte ciudadano de afectaciones ambientales.
-- Se ejecuta UNA vez, en el editor SQL de Supabase (SQL Editor > New query).
-- Si algo falla a la mitad, corrige y ejecuta solo desde la parte que faltó.

-- ============================================================
-- 1. Tipos y tablas
-- ============================================================

create type report_type as enum ('tala', 'quema', 'vertimiento', 'fauna', 'residuos', 'otro');
create type report_status as enum ('recibido', 'en_revision', 'atendido', 'descartado');

create table staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  tracking_code text not null unique,
  type report_type not null,
  description text not null check (char_length(description) between 10 and 1000),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  photo_path text,
  status report_status not null default 'recibido',
  public_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_status_fecha on reports (status, created_at desc);
create index reports_type on reports (type);

create table report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references reports (id) on delete cascade,
  status report_status not null,
  note text,
  staff_id uuid references staff (user_id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. Reglas de acceso (RLS): solo los funcionarios leen las tablas
-- ============================================================

alter table staff enable row level security;
alter table reports enable row level security;
alter table report_events enable row level security;

create or replace function is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

create policy staff_lee_staff on staff for select to authenticated using (user_id = auth.uid());
create policy staff_lee_reportes on reports for select to authenticated using (is_staff());
create policy staff_lee_eventos on report_events for select to authenticated using (is_staff());

-- ============================================================
-- 3. Funciones que usa la aplicación
-- ============================================================

create or replace function create_report(
  p_type report_type, p_description text,
  p_lat double precision, p_lng double precision, p_photo_path text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_id uuid;
begin
  insert into reports (tracking_code, type, description, lat, lng, photo_path)
  values (v_code, p_type, trim(p_description), p_lat, p_lng, p_photo_path)
  returning id into v_id;

  insert into report_events (report_id, status, note) values (v_id, 'recibido', 'Reporte recibido');
  return v_code;
end;
$$;

create or replace function get_report_status(p_code text)
returns table (tipo report_type, estado report_status, nota_publica text, creado timestamptz, actualizado timestamptz)
language sql security definer set search_path = public as $$
  select type, status, public_note, created_at, updated_at
  from reports where tracking_code = upper(trim(p_code));
$$;

create or replace function change_status(
  p_report uuid, p_status report_status, p_note text, p_public_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'no autorizado';
  end if;

  update reports
    set status = p_status,
        public_note = coalesce(p_public_note, public_note),
        updated_at = now()
    where id = p_report;

  insert into report_events (report_id, status, note, staff_id)
  values (p_report, p_status, p_note, auth.uid());
end;
$$;

grant execute on function create_report(report_type, text, double precision, double precision, text) to anon, authenticated;
grant execute on function get_report_status(text) to anon, authenticated;
revoke execute on function change_status(uuid, report_status, text, text) from public, anon;
grant execute on function change_status(uuid, report_status, text, text) to authenticated;

-- ============================================================
-- 4. Fotos: bucket privado, solo imágenes, máximo 2 MB
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy subir_fotos on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'report-photos');

create policy staff_ve_fotos on storage.objects for select to authenticated
  using (bucket_id = 'report-photos' and is_staff());
