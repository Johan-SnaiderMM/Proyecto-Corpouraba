-- Asignación de casos y casos que necesitan atención (panel del funcionario).
-- Se ejecuta UNA vez en el SQL Editor de Supabase, DESPUÉS de schema.sql y de la versión NUEVA de seguimiento.sql.
-- Se puede repetir. Para deshacerlo: supabase/asignacion-reversa.sql.
--
--   * Cada reporte puede tener un responsable (assigned_to). Si no tiene, cualquier funcionario puede tomarlo
--     o asignarlo; si ya tiene, solo ese responsable o un coordinador (staff.is_admin) puede cambiarlo.
--   * El panel calcula los casos que necesitan atención con report_attention().
--   * Cada cambio de responsable queda en el historial interno. El ciudadano no lo ve.
--
-- Para nombrar a un coordinador:  update staff set is_admin = true where user_id = 'EL-UUID';
-- Para dar de baja a un funcionario:  delete from auth.users where id = 'EL-UUID';
--   (sus casos quedan sin responsable, con un aviso en el historial; sus acciones pasadas se conservan sin nombre).

-- Si otra sesión tiene tablas ocupadas, mejor fallar pronto que dejar esperando a quien envía un reporte.
set lock_timeout = '5s';

-- Seguridad: sin la versión nueva de seguimiento.sql, get_report_tracking no sabe esconder los eventos de asignación
-- y cada "tomar" o "soltar" aparecería en el ticket del ciudadano. Se corta aquí antes de tocar nada.
do $$
begin
  if to_regprocedure('get_report_tracking(text)') is null
     or pg_get_functiondef('get_report_tracking(text)'::regprocedure) not like '%kind <> ''asignacion''%' then
    raise exception 'Ejecute primero la versión nueva de supabase/seguimiento.sql: sin ella, las asignaciones aparecerían en el ticket de la persona que reportó.';
  end if;
end $$;

-- ============================================================
-- 1. Columnas y restricciones
-- ============================================================

alter table staff add column if not exists is_admin boolean not null default false;

alter table reports add column if not exists assigned_to uuid references staff (user_id) on delete set null;
alter table reports add column if not exists assigned_at timestamptz;
create index if not exists reports_responsable on reports (assigned_to) where assigned_to is not null;

-- Un responsable siempre tiene fecha de asignación, y sin responsable no hay fecha.
alter table reports drop constraint if exists reports_responsable_coherente;
alter table reports add constraint reports_responsable_coherente check ((assigned_to is null) = (assigned_at is null));

-- Mismo conjunto de valores que en seguimiento.sql: se repite aquí para que el orden de ejecución no importe.
alter table report_events drop constraint if exists report_events_kind_check;
alter table report_events add constraint report_events_kind_check check (kind in ('estado', 'nota', 'validacion', 'asignacion'));

-- Dar de baja a un funcionario no debe borrar su trabajo: sus acciones pasadas quedan, sin nombre.
alter table report_events drop constraint if exists report_events_staff_id_fkey;
alter table report_events add constraint report_events_staff_id_fkey foreign key (staff_id) references staff (user_id) on delete set null;
alter table report_evidence alter column staff_id drop not null;
alter table report_evidence drop constraint if exists report_evidence_staff_id_fkey;
alter table report_evidence add constraint report_evidence_staff_id_fkey foreign key (staff_id) references staff (user_id) on delete set null;

-- Índices del historial: el panel pide los eventos de un caso, report_attention() busca el último cambio de estado y
-- borrar un reporte (on delete cascade) necesita encontrar sus eventos. Sin ellos cada una de esas cosas recorre toda la tabla.
create index if not exists report_events_reporte on report_events (report_id, created_at, id);
create index if not exists report_events_ultimo on report_events (report_id, created_at desc, id desc) where kind in ('estado', 'validacion');

-- ============================================================
-- 2. Funciones
-- ============================================================

-- Lista de funcionarios (para mostrar nombres y asignar). La tabla staff solo deja ver la fila propia.
-- Ojo: entrega el nombre completo y quién es coordinador a TODOS los funcionarios.
create or replace function list_staff()
returns table (user_id uuid, full_name text, is_admin boolean)
language sql security definer stable set search_path = public, pg_temp as $$
  select s.user_id, s.full_name, s.is_admin from staff s where is_staff() order by s.full_name;
$$;

-- Toma, suelta o reasigna un caso. p_to = null suelta el caso.
create or replace function assign_report(p_report uuid, p_to uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_yo uuid := auth.uid();
  r reports%rowtype;
  v_admin boolean;
  v_nombre_yo text;
  v_nombre_a text;
  v_nombre_antes text;
  v_nota text;
begin
  if not is_staff() then
    raise exception 'no autorizado';
  end if;

  -- "for update": dos personas que toman el mismo caso a la vez se turnan; gana la primera y la segunda recibe el aviso.
  select * into r from reports where id = p_report for update;
  if not found then
    raise exception 'reporte no encontrado';
  end if;

  select is_admin, full_name into v_admin, v_nombre_yo from staff where user_id = v_yo;
  if p_to is not null then
    select full_name into v_nombre_a from staff where user_id = p_to;
    if not found then
      raise exception 'ese funcionario no existe';
    end if;
  end if;

  -- Sin cambios: no se repite el aviso ni el historial (por ejemplo, por un doble clic).
  if r.assigned_to is not distinct from p_to then
    return;
  end if;

  if r.assigned_to is not null and r.assigned_to <> v_yo and not v_admin then
    raise exception 'este caso lo atiende otra persona; solo ella o un coordinador pueden cambiarlo';
  end if;

  if r.assigned_to is not null then
    select full_name into v_nombre_antes from staff where user_id = r.assigned_to;
  end if;

  update reports
    set assigned_to = p_to,
        assigned_at = case when p_to is null then null else now() end
    where id = p_report;
  -- No se toca updated_at: es lo que ve el ciudadano como "última actualización".

  -- El historial dice quién hizo qué y, si cambió de manos, de quién venía.
  v_nota := case
    when p_to is null then 'Caso liberado por ' || v_nombre_yo
    when p_to = v_yo and r.assigned_to is not null then v_nombre_yo || ' tomó el caso de ' || v_nombre_antes
    when p_to = v_yo then v_nombre_yo || ' tomó el caso'
    when r.assigned_to is null then v_nombre_yo || ' asignó el caso a ' || v_nombre_a
    when r.assigned_to = v_yo then v_nombre_yo || ' pasó el caso a ' || v_nombre_a
    else v_nombre_yo || ' reasignó el caso de ' || v_nombre_antes || ' a ' || v_nombre_a
  end;
  insert into report_events (report_id, status, note, kind, staff_id)
  values (p_report, r.status, v_nota, 'asignacion', v_yo);
end;
$$;

-- Si alguien se da de baja (delete en staff o en auth.users), sus casos quedan sin responsable y queda el aviso.
create or replace function staff_baja()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into report_events (report_id, status, note, kind)
  select r.id, r.status, 'Caso liberado: ' || old.full_name || ' ya no hace parte del equipo', 'asignacion'
  from reports r where r.assigned_to = old.user_id;
  update reports set assigned_to = null, assigned_at = null where assigned_to = old.user_id;
  return old;
end;
$$;

drop trigger if exists staff_baja on staff;
create trigger staff_baja before delete on staff for each row execute function staff_baja();

-- Casos abiertos que necesitan atención, con sus motivos:
--   reabierto   : la persona respondió "no conforme" y el caso no se ha vuelto a cerrar
--   sin_atender : sigue "recibido" después de MÁS de p_sin_atender_dias días
--   estancado   : en revisión, sin movimiento hace p_estancado_dias días o más
-- "Movimiento" es updated_at: lo mueven un cambio de estado, una evidencia o la respuesta de la persona; asignar no.
create or replace function report_attention(p_sin_atender_dias int default 2, p_estancado_dias int default 7)
returns table (report_id uuid, motivos text[], dias int)
language sql security definer stable set search_path = public, pg_temp as $$
  select c.id, c.motivos, c.dias
  from (
    select r.id,
           array_remove(array[
             case when u.kind = 'validacion' then 'reabierto' end,
             -- Los plazos se cuentan en horas reales (24 h por día), no en "días de calendario" de la zona horaria de la
             -- sesión: así un cambio de horario no mueve el umbral y "dias" (abajo) siempre concuerda con él.
             -- "Más de 2 días" (estricto) para sin_atender; "7 días o más" para estancado.
             case when r.status = 'recibido' and r.updated_at < now() - p_sin_atender_dias * interval '24 hours' then 'sin_atender' end,
             case when r.status = 'en_revision' and r.updated_at <= now() - p_estancado_dias * interval '24 hours' then 'estancado' end
           ], null) as motivos,
           floor(extract(epoch from now() - r.updated_at) / 86400)::int as dias
    from reports r
    -- Lo último que pasó en el caso entre los cambios de estado y las respuestas de la persona. Solo se mira por cada
    -- caso abierto (con el índice report_events_ultimo es una búsqueda corta, no un recorrido de todos los eventos).
    left join lateral (
      select e.kind
      from report_events e
      where e.report_id = r.id and e.kind in ('estado', 'validacion')
      order by e.created_at desc, e.id desc
      limit 1
    ) u on true
    where r.status in ('recibido', 'en_revision')
  ) c
  where is_staff() and cardinality(c.motivos) > 0;
$$;

revoke execute on function list_staff() from public, anon;
grant execute on function list_staff() to authenticated;
revoke execute on function assign_report(uuid, uuid) from public, anon;
grant execute on function assign_report(uuid, uuid) to authenticated;
revoke execute on function report_attention(int, int) from public, anon;
grant execute on function report_attention(int, int) to authenticated;
revoke execute on function staff_baja() from public, anon, authenticated;
