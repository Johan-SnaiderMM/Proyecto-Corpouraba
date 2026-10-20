-- Deshace supabase/asignacion.sql (responsables de caso y casos que requieren atención).
-- Úsese solo si hay que volver atrás. Se puede repetir. Se ejecuta en una sola transacción: o queda todo o no cambia nada.
--
--   * No toca seguimiento.sql: la versión nueva de seguimiento.sql sigue siendo válida sin asignación
--     (el ticket del ciudadano sigue ocultando lo interno).
--   * NO se pierde el historial: los eventos de asignación pasan a ser notas internas (kind = 'nota', sin texto público),
--     con el mismo texto ("Ana tomó el caso"). Siguen sin verse en el ticket del ciudadano.
--   * Quién tenía cada caso y quiénes eran coordinadores se guarda en las tablas respaldo_asignaciones y
--     respaldo_coordinadores (no se borran; elimínelas a mano cuando ya no las necesite).
--   * Después de ejecutarlo, el panel que ya está publicado sigue funcionando: esconde responsables y pendientes
--     porque list_staff() deja de existir.
--   * Para volver a instalarlo, ejecute supabase/asignacion.sql otra vez (los responsables se pueden recuperar de la tabla respaldo).

begin;
set local lock_timeout = '5s';

-- 1. Respaldo (solo si todavía existen las columnas)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reports' and column_name = 'assigned_to') then
    create table if not exists respaldo_asignaciones (report_id uuid primary key, assigned_to uuid, assigned_at timestamptz, respaldado_en timestamptz not null default now());
    insert into respaldo_asignaciones (report_id, assigned_to, assigned_at)
      select id, assigned_to, assigned_at from reports where assigned_to is not null
      on conflict (report_id) do update set assigned_to = excluded.assigned_to, assigned_at = excluded.assigned_at, respaldado_en = now();
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'staff' and column_name = 'is_admin') then
    create table if not exists respaldo_coordinadores (user_id uuid primary key, respaldado_en timestamptz not null default now());
    insert into respaldo_coordinadores (user_id) select user_id from staff where is_admin on conflict (user_id) do nothing;
  end if;
end $$;
-- Las tablas de respaldo no son para la web: se cierran con RLS (sin políticas, nadie con la clave pública las lee).
alter table if exists respaldo_asignaciones enable row level security;
alter table if exists respaldo_coordinadores enable row level security;

-- 2. El historial se conserva como notas internas
update report_events set kind = 'nota' where kind = 'asignacion';

-- 3. Funciones, disparador, índice y columnas
drop trigger if exists staff_baja on staff;
drop function if exists staff_baja();
drop function if exists report_attention(int, int);
drop function if exists assign_report(uuid, uuid);
drop function if exists list_staff();
drop index if exists reports_responsable;
alter table reports drop constraint if exists reports_responsable_coherente;
alter table reports drop column if exists assigned_to;
alter table reports drop column if exists assigned_at;
alter table staff drop column if exists is_admin;

-- 4. El conjunto de valores de kind vuelve al de antes de la asignación
alter table report_events drop constraint if exists report_events_kind_check;
alter table report_events add constraint report_events_kind_check check (kind in ('estado', 'nota', 'validacion'));

commit;
