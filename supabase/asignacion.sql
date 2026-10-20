-- Asignación de casos y casos que necesitan atención (panel del funcionario).
-- Se ejecuta UNA vez en el SQL Editor de Supabase, DESPUÉS de schema.sql y seguimiento.sql. Se puede repetir.
--
--   * Cada reporte puede tener un responsable (assigned_to). Si no tiene, cualquier funcionario puede tomarlo
--     o asignarlo; si ya tiene, solo ese responsable o un coordinador (staff.is_admin) puede cambiarlo.
--   * El panel calcula los casos que necesitan atención con report_attention().
--   * Cada cambio de responsable queda en el historial interno del caso. El ciudadano no lo ve.
--
-- Para nombrar a un coordinador:  update staff set is_admin = true where user_id = 'EL-UUID';

-- ============================================================
-- 1. Columnas
-- ============================================================

alter table staff add column if not exists is_admin boolean not null default false;

alter table reports add column if not exists assigned_to uuid references staff (user_id) on delete set null;
alter table reports add column if not exists assigned_at timestamptz;
create index if not exists reports_responsable on reports (assigned_to) where assigned_to is not null;

-- Mismo conjunto de valores que en seguimiento.sql: se repite aquí para que el orden de ejecución no importe.
alter table report_events drop constraint if exists report_events_kind_check;
alter table report_events add constraint report_events_kind_check check (kind in ('estado', 'nota', 'validacion', 'asignacion'));

-- ============================================================
-- 2. Funciones
-- ============================================================

-- Lista de funcionarios (para mostrar nombres y asignar). La tabla staff solo deja ver la fila propia.
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
  v_nota text;
begin
  if not is_staff() then
    raise exception 'no autorizado';
  end if;

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

  update reports
    set assigned_to = p_to,
        assigned_at = case when p_to is null then null else now() end
    where id = p_report;
  -- No se toca updated_at: es lo que ve el ciudadano como "última actualización".

  v_nota := case
    when p_to is null then 'Caso liberado por ' || v_nombre_yo
    when p_to = v_yo then v_nombre_yo || ' tomó el caso'
    else v_nombre_yo || ' asignó el caso a ' || v_nombre_a
  end;
  insert into report_events (report_id, status, note, kind, staff_id)
  values (p_report, r.status, v_nota, 'asignacion', v_yo);
end;
$$;

-- Casos abiertos que necesitan atención, con sus motivos:
--   reabierto   : la persona respondió "no conforme" y el caso no se ha vuelto a cerrar
--   sin_atender : sigue "recibido" después de p_sin_atender_dias días
--   estancado   : en revisión, sin movimiento hace p_estancado_dias días o más
create or replace function report_attention(p_sin_atender_dias int default 2, p_estancado_dias int default 7)
returns table (report_id uuid, motivos text[], dias int)
language sql security definer stable set search_path = public, pg_temp as $$
  with ultimo as (
    -- Lo último que pasó en el caso entre los cambios de estado y las respuestas de la persona.
    select distinct on (e.report_id) e.report_id, e.kind
    from report_events e
    where e.kind in ('estado', 'validacion')
    order by e.report_id, e.created_at desc, e.id desc
  ),
  calculo as (
    select r.id,
           array_remove(array[
             case when u.kind = 'validacion' then 'reabierto' end,
             case when r.status = 'recibido' and r.updated_at < now() - make_interval(days => p_sin_atender_dias) then 'sin_atender' end,
             case when r.status = 'en_revision' and r.updated_at < now() - make_interval(days => p_estancado_dias) then 'estancado' end
           ], null) as motivos,
           floor(extract(epoch from now() - r.updated_at) / 86400)::int as dias
    from reports r
    left join ultimo u on u.report_id = r.id
    where r.status in ('recibido', 'en_revision')
  )
  select c.id, c.motivos, c.dias from calculo c where is_staff() and cardinality(c.motivos) > 0;
$$;

revoke execute on function list_staff() from public, anon;
grant execute on function list_staff() to authenticated;
revoke execute on function assign_report(uuid, uuid) from public, anon;
grant execute on function assign_report(uuid, uuid) to authenticated;
revoke execute on function report_attention(int, int) from public, anon;
grant execute on function report_attention(int, int) to authenticated;
