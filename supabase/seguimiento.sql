-- Seguimiento con ticket, evidencia y validación ciudadana.
-- Se ejecuta UNA vez, en el SQL Editor de Supabase, DESPUÉS de schema.sql (y de seed.sql si lo usas).
-- Es seguro volver a ejecutarlo: usa "if not exists" y "create or replace".

-- ============================================================
-- 1. Cambios en tablas existentes
-- ============================================================

-- Texto que SÍ ve el ciudadano en la línea de tiempo (la columna "note" sigue siendo interna).
alter table report_events add column if not exists public_note text;

-- "estado" = cambio de estado hecho por un funcionario (el de "atendido" es el cierre que el ciudadano valida);
-- "nota" = el funcionario guardó el mismo estado con una nota (no crea un cierre nuevo);
-- "validacion" = respuesta del ciudadano;
-- "asignacion" = alguien tomó, soltó o reasignó el caso (interno: el ciudadano nunca lo ve; ver supabase/asignacion.sql).
alter table report_events add column if not exists kind text not null default 'estado';
alter table report_events drop constraint if exists report_events_kind_check;
alter table report_events add constraint report_events_kind_check check (kind in ('estado', 'nota', 'validacion', 'asignacion'));

update report_events set public_note = 'Reporte recibido' where note = 'Reporte recibido' and public_note is null;

-- ============================================================
-- 2. Tablas nuevas
-- ============================================================

-- Evidencia que sube la Corporación (foto de la acción realizada). Todo lo que se guarda aquí
-- lo ve quien tenga el ticket: no subas fotos con rostros ni datos personales.
create table if not exists report_evidence (
  id bigint generated always as identity primary key,
  report_id uuid not null references reports (id) on delete cascade,
  storage_path text not null,
  caption text not null check (char_length(caption) between 3 and 300),
  staff_id uuid not null references staff (user_id),
  created_at timestamptz not null default now()
);
create index if not exists report_evidence_reporte on report_evidence (report_id, created_at);

-- Respuesta del ciudadano sobre una acción. "event_id" es el evento "atendido" que se valida:
-- solo se puede responder una vez por cada vez que la Corporación marca el caso como atendido.
create table if not exists report_validations (
  id bigint generated always as identity primary key,
  report_id uuid not null references reports (id) on delete cascade,
  event_id bigint not null unique references report_events (id) on delete cascade,
  verdict text not null check (verdict in ('conforme', 'no_conforme')),
  comment text check (char_length(comment) <= 300),
  created_at timestamptz not null default now()
);

alter table report_evidence enable row level security;
alter table report_validations enable row level security;

drop policy if exists staff_lee_evidencia on report_evidence;
drop policy if exists staff_lee_validaciones on report_validations;
create policy staff_lee_evidencia on report_evidence for select to authenticated using (is_staff());
create policy staff_lee_validaciones on report_validations for select to authenticated using (is_staff());

-- ============================================================
-- 3. Funciones
-- ============================================================
-- Todas las funciones SECURITY DEFINER fijan search_path con pg_temp al final, para que nadie pueda
-- suplantar una tabla con una temporal.

create or replace function is_staff() returns boolean
language sql security definer stable set search_path = public, pg_temp as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

-- Deja el código en mayúsculas y sin guiones ni espacios: "a1b2-c3d4 e5f6" -> "A1B2C3D4E5F6".
create or replace function norm_code(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Los códigos nuevos tienen 16 caracteres (64 bits al azar): el código es la única llave del ticket y además
-- permite responder la validación, así que no debe poder adivinarse. Los de 8 de versiones anteriores
-- siguen funcionando, pero son fáciles de calcular: bórralos o regenéralos antes de usar datos reales.
create or replace function create_report(
  p_type report_type, p_description text,
  p_lat double precision, p_lng double precision, p_photo_path text default null
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
                    || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_id uuid;
begin
  insert into reports (tracking_code, type, description, lat, lng, photo_path)
  values (v_code, p_type, trim(p_description), p_lat, p_lng, p_photo_path)
  returning id into v_id;

  insert into report_events (report_id, status, note, public_note)
  values (v_id, 'recibido', 'Reporte recibido', 'Reporte recibido');
  return v_code;
end;
$$;

create or replace function get_report_status(p_code text)
returns table (tipo report_type, estado report_status, nota_publica text, creado timestamptz, actualizado timestamptz)
language sql security definer set search_path = public, pg_temp as $$
  select type, status, public_note, created_at, updated_at
  from reports where tracking_code = norm_code(p_code);
$$;

-- Cambia el estado. Si el estado es el mismo que ya tenía, solo guarda una nota (kind = 'nota'): así volver a
-- guardar "atendido" no crea un cierre nuevo ni borra la validación del ciudadano. La nota pública pertenece a
-- cada cambio: si no se escribe una, la anterior deja de mostrarse (salvo en una nota que no es pública).
create or replace function change_status(
  p_report uuid, p_status report_status, p_note text, p_public_note text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actual report_status;
  v_clase text;
  v_publica text := nullif(trim(coalesce(p_public_note, '')), '');
begin
  if not is_staff() then
    raise exception 'no autorizado';
  end if;

  select status into v_actual from reports where id = p_report for update;
  if not found then
    raise exception 'reporte no encontrado';
  end if;

  v_clase := case when v_actual = p_status then 'nota' else 'estado' end;

  update reports
    set status = p_status,
        public_note = case when v_clase = 'nota' and v_publica is null then public_note else v_publica end,
        updated_at = now()
    where id = p_report;

  insert into report_events (report_id, status, note, public_note, kind, staff_id)
  values (p_report, p_status, p_note, v_publica, v_clase, auth.uid());
end;
$$;

-- El funcionario sube primero la foto al bucket "report-evidence" (ruta "<id del reporte>/<uuid>.jpg")
-- y luego llama a esta función para registrarla.
create or replace function add_evidence(p_report uuid, p_path text, p_caption text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_staff() then
    raise exception 'no autorizado';
  end if;
  if not exists (select 1 from reports where id = p_report) then
    raise exception 'reporte no encontrado';
  end if;
  if p_path is null or p_path !~ ('^' || p_report::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'ruta de evidencia no válida';
  end if;

  insert into report_evidence (report_id, storage_path, caption, staff_id)
  values (p_report, p_path, trim(p_caption), auth.uid());

  update reports set updated_at = now() where id = p_report;
end;
$$;

-- Todo lo que ve el ciudadano con su ticket, en una sola respuesta. "cierre" es el número del cierre que
-- puede validar: hay que devolverlo a validate_report para que la respuesta se aplique a lo que la persona vio.
create or replace function get_report_tracking(p_code text)
returns jsonb
language plpgsql security definer stable set search_path = public, pg_temp as $$
declare
  r reports%rowtype;
  v_cierre bigint;
begin
  select * into r from reports where tracking_code = norm_code(p_code);
  if not found then
    return null;
  end if;

  -- Último evento "atendido" puesto por la Corporación: es el que el ciudadano puede validar.
  select id into v_cierre from report_events
  where report_id = r.id and status = 'atendido' and kind = 'estado'
  order by created_at desc, id desc limit 1;

  return jsonb_build_object(
    'codigo', r.tracking_code,
    'tipo', r.type,
    'estado', r.status,
    'creado', r.created_at,
    'actualizado', r.updated_at,
    'nota_publica', r.public_note,
    'cierre', v_cierre,
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object('estado', e.status, 'nota', e.public_note, 'fecha', e.created_at, 'clase', e.kind)
                       order by e.created_at, e.id)
      from report_events e
      -- Se muestra lo que es del ciudadano (cambios de estado y su propia respuesta) y cualquier nota que tenga
      -- texto público. Todo lo demás (asignaciones, notas internas) queda fuera.
      where e.report_id = r.id and (e.kind in ('estado', 'validacion') or e.public_note is not null)), '[]'::jsonb),
    'evidencias', coalesce((
      select jsonb_agg(jsonb_build_object('ruta', v.storage_path, 'descripcion', v.caption, 'fecha', v.created_at)
                       order by v.created_at, v.id)
      from report_evidence v where v.report_id = r.id), '[]'::jsonb),
    'validacion', (
      select jsonb_build_object('veredicto', x.verdict, 'comentario', x.comment, 'fecha', x.created_at)
      from report_validations x where x.event_id = v_cierre),
    'puede_validar', (
      r.status = 'atendido' and v_cierre is not null
      and not exists (select 1 from report_validations x where x.event_id = v_cierre))
  );
end;
$$;

-- El ciudadano confirma o rechaza la acción de la Corporación. Solo con el caso en "atendido", una vez por cada
-- cierre y sobre el cierre que la persona vio (p_cierre). Si dice que NO está conforme, el caso vuelve a
-- "en revisión" y queda en el historial.
drop function if exists validate_report(text, text, text);
create or replace function validate_report(p_code text, p_verdict text, p_comment text, p_cierre bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r reports%rowtype;
  v_cierre bigint;
  -- Se quitan espacios, tabuladores, saltos de línea y espacios invisibles al inicio y al final.
  v_comment text := nullif(regexp_replace(coalesce(p_comment, ''),
                                          '^[[:space:] ​﻿]+|[[:space:] ​﻿]+$', '', 'g'), '');
begin
  if p_verdict not in ('conforme', 'no_conforme') then
    raise exception 'respuesta no válida';
  end if;
  if char_length(coalesce(v_comment, '')) > 300 then
    raise exception 'el comentario es demasiado largo';
  end if;

  select * into r from reports where tracking_code = norm_code(p_code) for update;
  if not found then
    raise exception 'reporte no encontrado';
  end if;
  if r.status <> 'atendido' then
    raise exception 'este reporte no está esperando validación';
  end if;

  select id into v_cierre from report_events
  where report_id = r.id and status = 'atendido' and kind = 'estado'
  order by created_at desc, id desc limit 1;
  if v_cierre is null then
    raise exception 'este reporte no está esperando validación';
  end if;
  if p_cierre is distinct from v_cierre then
    raise exception 'el reporte cambió desde que lo consultó; recargue la página';
  end if;
  if exists (select 1 from report_validations where event_id = v_cierre) then
    raise exception 'este reporte ya fue validado';
  end if;

  insert into report_validations (report_id, event_id, verdict, comment)
  values (r.id, v_cierre, p_verdict, v_comment);

  if p_verdict = 'conforme' then
    insert into report_events (report_id, status, note, public_note, kind)
    values (r.id, 'atendido', 'Validación ciudadana: conforme' || coalesce(' — ' || v_comment, ''),
            'El ciudadano confirmó que la acción se cumplió.', 'validacion');
  else
    update reports
      set status = 'en_revision',
          public_note = 'El ciudadano indicó que el problema continúa; el caso vuelve a revisión.',
          updated_at = now()
      where id = r.id;
    insert into report_events (report_id, status, note, public_note, kind)
    values (r.id, 'en_revision', 'Validación ciudadana: NO conforme' || coalesce(' — ' || v_comment, ''),
            'El ciudadano indicó que el problema continúa; el caso vuelve a revisión.', 'validacion');
  end if;
end;
$$;

grant execute on function norm_code(text) to anon, authenticated;
-- OJO: aquí NO se vuelve a dar permiso sobre create_report. "create or replace" conserva los permisos que ya tenía
-- (los de schema.sql o, si se activó el captcha, los de supabase/captcha.sql). Si se otorgara aquí, repetir este archivo
-- reabriría sin aviso la puerta que el captcha cerró.
grant execute on function get_report_status(text) to anon, authenticated;
grant execute on function get_report_tracking(text) to anon, authenticated;
grant execute on function validate_report(text, text, text, bigint) to anon, authenticated;
revoke execute on function change_status(uuid, report_status, text, text) from public, anon;
grant execute on function change_status(uuid, report_status, text, text) to authenticated;
revoke execute on function add_evidence(uuid, text, text) from public, anon;
grant execute on function add_evidence(uuid, text, text) to authenticated;

-- ============================================================
-- 4. Evidencia: bucket público de lectura, escritura solo para funcionarios
-- ============================================================
-- Es público para que el ciudadano vea las fotos con su ticket sin iniciar sesión. Nadie puede listar
-- el contenido y cada archivo tiene un nombre aleatorio: solo se llega a una foto con su enlace exacto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-evidence', 'report-evidence', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists staff_sube_evidencia on storage.objects;
create policy staff_sube_evidencia on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-evidence'
    and is_staff()
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  );
