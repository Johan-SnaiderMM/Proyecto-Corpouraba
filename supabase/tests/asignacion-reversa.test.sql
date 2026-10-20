-- Pruebas después de DESHACER la asignación (supabase/asignacion-reversa.sql).
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

\echo '-- Reversa de la asignación'
select pruebas.esperar(not exists (select 1 from information_schema.columns where table_name = 'reports' and column_name in ('assigned_to', 'assigned_at'))
                       and not exists (select 1 from information_schema.columns where table_name = 'staff' and column_name = 'is_admin'), 'las columnas nuevas ya no están');
select pruebas.esperar(to_regprocedure('assign_report(uuid, uuid)') is null and to_regprocedure('list_staff()') is null
                       and to_regprocedure('report_attention(int, int)') is null and to_regprocedure('staff_baja()') is null, 'las funciones y el disparador ya no están');
select pruebas.esperar(not exists (select 1 from report_events where kind = 'asignacion') and exists (select 1 from report_events where kind = 'nota' and note like '%tomó el caso%'),
  'el historial de asignaciones se conserva como notas internas');
select pruebas.esperar((select count(*) from respaldo_asignaciones) > 0, 'queda un respaldo de quién tenía cada caso');
select pruebas.esperar((select count(*) from respaldo_coordinadores) > 0, 'y de quiénes eran coordinadores');
set role anon;
select pruebas.esperar((select count(*) from respaldo_asignaciones) = 0, 'el respaldo no se puede leer con la clave pública (RLS)');
select pruebas.esperar(get_report_tracking('DEMO0001VALIDADO') ->> 'estado' = 'atendido', 'el ticket de la persona sigue funcionando');
reset role;
select pruebas.esperar(pg_get_constraintdef((select oid from pg_constraint where conname = 'report_events_kind_check')) not like '%asignacion%', 'el conjunto de tipos de evento vuelve al anterior');
\echo '-- Reversa: TODO OK'
