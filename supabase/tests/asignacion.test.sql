-- Pruebas de la asignación de casos y de los casos que necesitan atención (supabase/asignacion.sql).
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

-- Preparación (administrador): la funcionaria 1111 ya existe (seguimiento.test.sql); se agregan una segunda
-- funcionaria (3333), un coordinador (4444) y un usuario con sesión que NO es funcionario (5555).
insert into auth.users (id) values ('33333333-3333-3333-3333-333333333333'), ('44444444-4444-4444-4444-444444444444'), ('55555555-5555-5555-5555-555555555555');
insert into staff (user_id, full_name) values ('33333333-3333-3333-3333-333333333333', 'Segunda funcionaria');
insert into staff (user_id, full_name, is_admin) values ('44444444-4444-4444-4444-444444444444', 'Coordinador de prueba', true);

\echo '-- Permisos'
set role anon;
select pruebas.esperar_error($q$select * from list_staff()$q$, 'permission denied', 'anon no lista funcionarios');
select pruebas.esperar_error($q$select assign_report(gen_random_uuid(), null)$q$, 'permission denied', 'anon no asigna casos');
select pruebas.esperar_error($q$select * from report_attention()$q$, 'permission denied', 'anon no ve los casos que necesitan atención');
reset role;
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select pruebas.esperar((select count(*) from list_staff()) = 0, 'un usuario con sesión que no es funcionario ve 0 funcionarios');
select pruebas.esperar((select count(*) from report_attention()) = 0, 'ni casos que necesiten atención');
select pruebas.esperar_error($q$select assign_report(gen_random_uuid(), null)$q$, 'no autorizado', 'ni puede asignar');
reset role;
reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar((select count(*) from list_staff()) = 3, 'una funcionaria ve la lista del personal (3)');
select pruebas.esperar((select is_admin from list_staff() where user_id = '44444444-4444-4444-4444-444444444444'), 'se sabe quién es coordinador');
reset role;
reset request.jwt.claim.sub;

\echo '-- Tomar, soltar y reasignar un caso'
set role anon;
select create_report('tala', 'Reporte para probar la asignación', 7.8, -76.6, null) as codigo \gset
reset role;
select id as rid, updated_at as actualizado0 from reports where tracking_code = :'codigo' \gset
select pruebas.esperar((select assigned_to is null from reports where id = :'rid'), 'un reporte nuevo no tiene responsable');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select assign_report(:'rid', '11111111-1111-1111-1111-111111111111');   -- la funcionaria 1111 toma el caso
select pruebas.esperar((select assigned_to from reports where id = :'rid') = '11111111-1111-1111-1111-111111111111', 'la funcionaria toma el caso');
select pruebas.esperar((select assigned_at is not null from reports where id = :'rid'), 'queda la fecha de asignación');
select assign_report(:'rid', '11111111-1111-1111-1111-111111111111');   -- doble clic
reset role;
reset request.jwt.claim.sub;
select pruebas.esperar((select count(*) from report_events where report_id = :'rid' and kind = 'asignacion') = 1, 'repetir la misma asignación no duplica el historial');
select pruebas.esperar((select note from report_events where report_id = :'rid' and kind = 'asignacion') = 'Funcionaria de prueba tomó el caso', 'el historial dice quién tomó el caso');
select pruebas.esperar((select updated_at from reports where id = :'rid') = :'actualizado0', 'asignar no cambia la "última actualización" que ve la persona');

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pruebas.esperar_error(format($q$select assign_report(%L, %L)$q$, :'rid', '33333333-3333-3333-3333-333333333333'), 'lo atiende otra persona', 'otra funcionaria no puede quitarle el caso');
select pruebas.esperar_error(format($q$select assign_report(%L, null)$q$, :'rid'), 'lo atiende otra persona', 'ni soltarlo');
reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select assign_report(:'rid', '33333333-3333-3333-3333-333333333333');   -- el responsable se lo pasa a la segunda funcionaria
reset role;
reset request.jwt.claim.sub;
select pruebas.esperar((select assigned_to from reports where id = :'rid') = '33333333-3333-3333-3333-333333333333', 'el responsable puede pasar el caso a otra persona');
select pruebas.esperar((select note from report_events where report_id = :'rid' and kind = 'asignacion' order by id desc limit 1) = 'Funcionaria de prueba pasó el caso a Segunda funcionaria',
  'el historial dice quién lo pasó y a quién');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar_error(format($q$select assign_report(%L, %L)$q$, :'rid', '11111111-1111-1111-1111-111111111111'), 'lo atiende otra persona', 'quien lo soltó ya no puede recuperarlo sin pedirlo');
reset role;
reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select assign_report(:'rid', '44444444-4444-4444-4444-444444444444');   -- el coordinador se lo queda
reset role;
reset request.jwt.claim.sub;
select pruebas.esperar((select assigned_to from reports where id = :'rid') = '44444444-4444-4444-4444-444444444444', 'un coordinador puede reasignar aunque el caso sea de otra persona');
select pruebas.esperar((select note from report_events where report_id = :'rid' and kind = 'asignacion' order by id desc limit 1) = 'Coordinador de prueba tomó el caso de Segunda funcionaria',
  'el historial dice de quién venía el caso');
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select assign_report(:'rid', null);
reset role;
reset request.jwt.claim.sub;
select pruebas.esperar((select assigned_to is null and assigned_at is null from reports where id = :'rid'), 'soltar deja el caso sin responsable');
select pruebas.esperar((select note from report_events where report_id = :'rid' and kind = 'asignacion' order by id desc limit 1) = 'Caso liberado por Coordinador de prueba', 'el historial dice quién lo liberó');

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pruebas.esperar_error(format($q$select assign_report(%L, gen_random_uuid())$q$, :'rid'), 'no existe', 'no se asigna a alguien que no es funcionario');
select pruebas.esperar_error($q$select assign_report(gen_random_uuid(), null)$q$, 'no encontrado', 'no se asigna un reporte que no existe');
reset role;
reset request.jwt.claim.sub;

\echo '-- La persona que reportó nunca ve las asignaciones'
set role anon;
select get_report_tracking(:'codigo')::text as tracking \gset
reset role;
select pruebas.esperar(position('tomó el caso' in :'tracking') = 0 and position('asignó' in :'tracking') = 0 and position('liberado' in :'tracking') = 0
                       and position('Segunda funcionaria' in :'tracking') = 0 and position('Coordinador' in :'tracking') = 0,
  'el ticket no menciona a los funcionarios ni sus asignaciones');
set role anon;
select pruebas.esperar(jsonb_array_length(get_report_tracking(:'codigo') -> 'eventos') = 1, 'el ticket solo muestra "recibido" (las asignaciones quedan fuera)');
select pruebas.esperar((get_report_tracking(:'codigo') ->> 'actualizado')::timestamptz = :'actualizado0'::timestamptz, 'y la última actualización no se movió');
reset role;

\echo '-- Casos que necesitan atención'
set role anon;
select create_report('quema', 'Caso recibido hace tres días', 7.8, -76.6, null) as c_a \gset
select create_report('quema', 'Caso recibido hace un día', 7.8, -76.6, null) as c_b \gset
select create_report('quema', 'Caso en revisión hace ocho días', 7.8, -76.6, null) as c_c \gset
select create_report('quema', 'Caso en revisión hace tres días', 7.8, -76.6, null) as c_d \gset
select create_report('quema', 'Caso ya atendido hace mucho', 7.8, -76.6, null) as c_e \gset
select create_report('quema', 'Caso que la persona reabre', 7.8, -76.6, null) as c_f \gset
select create_report('quema', 'Caso que la persona valida como conforme', 7.8, -76.6, null) as c_g \gset
reset role;
select id as ra from reports where tracking_code = :'c_a' \gset
select id as rb from reports where tracking_code = :'c_b' \gset
select id as rc from reports where tracking_code = :'c_c' \gset
select id as rd from reports where tracking_code = :'c_d' \gset
select id as re from reports where tracking_code = :'c_e' \gset
select id as rf from reports where tracking_code = :'c_f' \gset
select id as rg from reports where tracking_code = :'c_g' \gset

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select change_status(:'rc', 'en_revision', 'x', null);
select change_status(:'rd', 'en_revision', 'x', null);
select change_status(:'re', 'atendido', 'x', 'Atendido');
select change_status(:'rf', 'atendido', 'x', 'Atendido');
select change_status(:'rg', 'atendido', 'x', 'Atendido');
reset role;
reset request.jwt.claim.sub;
set role anon;
select get_report_tracking(:'c_f') ->> 'cierre' as cierre_f \gset
select validate_report(:'c_f', 'no_conforme', 'Sigue igual', :'cierre_f'::bigint);
select get_report_tracking(:'c_g') ->> 'cierre' as cierre_g \gset
select validate_report(:'c_g', 'conforme', 'Todo bien', :'cierre_g'::bigint);
reset role;

-- Se simula el paso del tiempo cambiando las fechas (como administrador).
update reports set updated_at = now() - interval '3 days' where id = :'ra';
update reports set updated_at = now() - interval '1 day' where id = :'rb';
update reports set updated_at = now() - interval '8 days' where id = :'rc';
update reports set updated_at = now() - interval '3 days' where id = :'rd';
update reports set updated_at = now() - interval '30 days' where id = :'re';

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar((select motivos from report_attention() where report_id = :'ra') = array['sin_atender'] and (select dias from report_attention() where report_id = :'ra') = 3,
  'recibido hace 3 días: "sin atender", con 3 días');
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'rb'), 'recibido hace 1 día: todavía no');
select pruebas.esperar((select motivos from report_attention() where report_id = :'rc') = array['estancado'], 'en revisión sin movimiento hace 8 días: "estancado"');
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'rd'), 'en revisión hace 3 días: todavía no');
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'re'), 'un caso atendido no necesita atención aunque sea viejo');
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'rg'), 'un caso validado como conforme no necesita atención');
select pruebas.esperar((select motivos from report_attention() where report_id = :'rf') = array['reabierto'], 'el caso que la persona rechazó aparece como "reabierto"');
select pruebas.esperar(exists (select 1 from report_attention(1, 1) where report_id = :'rb'), 'los plazos se pueden cambiar (1 día)');
select pruebas.esperar(not exists (select 1 from report_attention(10, 10) where report_id in (:'ra', :'rc')), 'y alargar (10 días)');
reset role;
reset request.jwt.claim.sub;

update reports set updated_at = now() - interval '10 days' where id = :'rf';
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar((select motivos from report_attention() where report_id = :'rf') @> array['reabierto', 'estancado'], 'un caso puede tener varios motivos a la vez');
-- Una nota o evidencia no cierra el caso reabierto; volver a marcarlo atendido, sí.
select change_status(:'rf', 'en_revision', 'seguimos revisando', null);
select pruebas.esperar(exists (select 1 from report_attention() where report_id = :'rf' and 'reabierto' = any (motivos)), 'una nota sobre el caso reabierto no lo cierra');
select change_status(:'rf', 'atendido', 'resuelto otra vez', 'Se resolvió');
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'rf'), 'al volver a marcarlo atendido deja de necesitar atención');
reset role;
reset request.jwt.claim.sub;

select pruebas.esperar((select count(*) from reports r where r.status in ('recibido', 'en_revision') and r.updated_at > now() - interval '1 hour') > 0, 'precondición: hay casos recientes (seed)');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar(not exists (select 1 from report_attention() a join reports r on r.id = a.report_id where r.description like 'Reporte de prueba%'),
  'los reportes recién creados (seed) no aparecen como pendientes');
reset role;
reset request.jwt.claim.sub;

\echo '-- Funciones y permisos'
select pruebas.esperar(not has_function_privilege('anon', 'assign_report(uuid, uuid)', 'execute') and not has_function_privilege('anon', 'list_staff()', 'execute')
                       and not has_function_privilege('anon', 'report_attention(int, int)', 'execute'), 'anon no ejecuta ninguna de las funciones nuevas');
select pruebas.esperar(has_function_privilege('authenticated', 'assign_report(uuid, uuid)', 'execute'), 'authenticated sí (la función exige ser funcionario)');
select pruebas.esperar((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.prosecdef and not coalesce('search_path=public, pg_temp' = any (p.proconfig), false)) = 0,
  'todas las funciones SECURITY DEFINER (también las nuevas) fijan search_path con pg_temp');
\echo '-- Nadie puede saltarse las reglas escribiendo directamente en las tablas'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare n int;
begin
  update staff set is_admin = true where user_id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLÓ: una funcionaria pudo ponerse como coordinadora (UPDATE en staff)'; end if;
  raise notice 'ok: nadie se nombra coordinador con un UPDATE directo';

  update reports set assigned_to = '11111111-1111-1111-1111-111111111111', assigned_at = now();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLÓ: se cambió assigned_to con un UPDATE directo'; end if;
  raise notice 'ok: tampoco se cambia el responsable con un UPDATE directo';

  delete from reports;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLÓ: una funcionaria pudo borrar reportes'; end if;
  delete from staff;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLÓ: una funcionaria pudo borrar funcionarios'; end if;
  raise notice 'ok: no se borran reportes ni funcionarios directamente';
end $$;
select pruebas.esperar_error($q$insert into staff (user_id, full_name, is_admin) values (gen_random_uuid(), 'Intrusa', true)$q$, 'row-level security', 'nadie se agrega a staff directamente');
select pruebas.esperar_error(format($q$insert into report_events (report_id, status, note, kind) values (%L, 'atendido', 'falsa', 'asignacion')$q$, :'rid'), 'row-level security', 'ni inventa eventos en el historial');
reset role;
reset request.jwt.claim.sub;

\echo '-- Otras funciones no tocan al responsable, y la asignación deja su huella'
select pruebas.esperar(pg_get_functiondef('assign_report(uuid, uuid)'::regprocedure) ilike '%from reports where id = p_report for update%', 'assign_report bloquea la fila del reporte (dos personas no toman el mismo caso a la vez)');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select assign_report(:'rid', '11111111-1111-1111-1111-111111111111');
select change_status(:'rid', 'en_revision', 'x', 'Se revisa');
select add_evidence(:'rid', :'rid' || '/' || gen_random_uuid() || '.jpg', 'Visita al sitio');
reset role;
reset request.jwt.claim.sub;
select pruebas.esperar((select assigned_to from reports where id = :'rid') = '11111111-1111-1111-1111-111111111111', 'cambiar el estado o subir evidencia no cambia el responsable');
select pruebas.esperar((select count(*) from report_events where report_id = :'rid' and kind = 'asignacion' and staff_id is null) = 0, 'cada asignación guarda quién la hizo');

\echo '-- Restricciones de la tabla'
select pruebas.esperar_error(format($q$update reports set assigned_to = '11111111-1111-1111-1111-111111111111', assigned_at = null where id = %L$q$, :'rid'),
  'reports_responsable_coherente', 'no hay responsable sin fecha de asignación');
select pruebas.esperar_error(format($q$update reports set assigned_to = null where id = %L$q$, :'rid'), 'reports_responsable_coherente', 'ni fecha sin responsable');

\echo '-- El ticket de la persona se protege en dos capas'
insert into report_events (report_id, status, note, public_note, kind) values (:'rid', 'en_revision', 'x', 'TEXTO-DE-ASIGNACION-QUE-NO-DEBE-SALIR', 'asignacion');
insert into report_events (report_id, status, note, public_note, kind) values (:'rid', 'en_revision', 'x', '   ', 'nota');
insert into report_events (report_id, status, note, public_note, kind) values (:'rid', 'en_revision', 'x', null, 'nota');
set role anon;
select pruebas.esperar(position('TEXTO-DE-ASIGNACION' in get_report_tracking(:'codigo')::text) = 0, 'una asignación jamás sale en el ticket, aunque traiga texto público');
reset role;
select count(*) as visibles_antes from (select 1) x \gset
set role anon;
select jsonb_array_length(get_report_tracking(:'codigo') -> 'eventos') as eventos_ticket \gset
reset role;
select pruebas.esperar(:eventos_ticket = (select count(*) from report_events where report_id = :'rid' and kind in ('estado', 'validacion')),
  'ni las notas vacías o solo con espacios: el ticket muestra solo estados y respuestas');

\echo '-- Dar de baja a un funcionario no rompe nada ni borra el trabajo'
insert into auth.users (id) values ('66666666-6666-6666-6666-666666666666');
insert into staff (user_id, full_name) values ('66666666-6666-6666-6666-666666666666', 'Funcionario que se va');
set role anon;
select create_report('tala', 'Reporte de quien se va del equipo', 7.8, -76.6, null) as codigo_baja \gset
reset role;
select id as rbaja from reports where tracking_code = :'codigo_baja' \gset
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select assign_report(:'rbaja', '66666666-6666-6666-6666-666666666666');
select change_status(:'rbaja', 'en_revision', 'revisé', 'Se revisa');
select add_evidence(:'rbaja', :'rbaja' || '/' || gen_random_uuid() || '.jpg', 'Visita antes de irme');
reset role;
reset request.jwt.claim.sub;
delete from auth.users where id = '66666666-6666-6666-6666-666666666666';
select pruebas.esperar(not exists (select 1 from staff where user_id = '66666666-6666-6666-6666-666666666666'), 'se pudo dar de baja a un funcionario que ya tenía trabajo');
select pruebas.esperar((select assigned_to is null and assigned_at is null from reports where id = :'rbaja'), 'su caso queda sin responsable (y sin fecha)');
select pruebas.esperar((select note from report_events where report_id = :'rbaja' and kind = 'asignacion' order by id desc limit 1) = 'Caso liberado: Funcionario que se va ya no hace parte del equipo',
  'el historial avisa que el caso quedó libre');
select pruebas.esperar((select count(*) from report_events where report_id = :'rbaja' and kind = 'estado') = 2 and (select count(*) from report_evidence where report_id = :'rbaja') = 1,
  'sus cambios de estado y su evidencia se conservan');
select pruebas.esperar((select count(*) from report_events where report_id = :'rbaja' and staff_id is not null) = 0 and (select count(*) from report_evidence where report_id = :'rbaja' and staff_id is not null) = 0,
  'pero quedan sin nombre');
\echo '-- Asignación: TODO OK'
