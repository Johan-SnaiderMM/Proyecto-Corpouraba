-- Pruebas del seguimiento con ticket, evidencia y validación (supabase/seguimiento.sql).
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

-- Preparación (como administrador): un funcionario y un usuario autenticado que NO es funcionario.
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into staff values ('11111111-1111-1111-1111-111111111111', 'Funcionaria de prueba');

\echo '-- Códigos'
select pruebas.esperar((select min(length(tracking_code)) from reports where description like 'Reporte de prueba%') = 16,
  'los datos de prueba (seed) tienen códigos de 16 caracteres');
select pruebas.esperar((select count(distinct tracking_code) from reports) = (select count(*) from reports), 'los códigos son únicos');

\echo '-- 1. Una persona anónima crea un reporte y lo consulta con su ticket'
set role anon;
select create_report('tala', 'Tala de árboles junto al río', 7.88, -76.63, null) as codigo \gset
select pruebas.esperar(:'codigo' ~ '^[0-9A-F]{16}$', 'el ticket tiene 16 caracteres hexadecimales');
select pruebas.esperar(get_report_tracking(:'codigo') ->> 'estado' = 'recibido', 'se consulta con el código exacto');
select pruebas.esperar(get_report_tracking(lower(substr(:'codigo', 1, 4) || '-' || substr(:'codigo', 5, 4) || ' ' || substr(:'codigo', 9)))
                       ->> 'estado' = 'recibido', 'se consulta en minúsculas, con guiones y espacios');
select pruebas.esperar(get_report_tracking('NOEXISTE00000000') is null, 'un código inexistente da null');
select pruebas.esperar(get_report_tracking(:'codigo') ->> 'puede_validar' = 'false', 'recién recibido no se puede validar');
reset role;
select id as rid from reports where tracking_code = :'codigo' \gset

\echo '-- 2. Una persona anónima no puede leer ni escribir tablas, ni usar funciones de funcionarios'
set role anon;
select pruebas.esperar((select count(*) from reports) = 0, 'anon no ve ningún reporte (RLS)');
select pruebas.esperar((select count(*) from report_events) = 0, 'anon no ve el historial (RLS)');
select pruebas.esperar((select count(*) from report_evidence) = 0, 'anon no ve la evidencia por tabla (RLS)');
select pruebas.esperar((select count(*) from report_validations) = 0, 'anon no ve las validaciones (RLS)');
select pruebas.esperar_error($q$insert into reports (tracking_code, type, description, lat, lng) values ('X', 'tala', 'xxxxxxxxxxxx', 1, 1)$q$,
  'row-level security', 'anon no puede insertar reportes directamente');
select pruebas.esperar_error($q$insert into report_validations (report_id, event_id, verdict) values (gen_random_uuid(), 1, 'conforme')$q$,
  'row-level security', 'anon no puede insertar validaciones directamente');
select pruebas.esperar_error(format($q$select change_status(%L, 'atendido', 'x', 'y')$q$, :'rid'), 'permission denied', 'anon no puede cambiar el estado');
select pruebas.esperar_error(format($q$select add_evidence(%L, %L, 'hola')$q$, :'rid', :'rid' || '/' || gen_random_uuid() || '.jpg'),
  'permission denied', 'anon no puede registrar evidencia');
select pruebas.esperar_error(format($q$select validate_report(%L, 'conforme', null, 1)$q$, :'codigo'), 'no está esperando validación',
  'no se puede validar un reporte que no está atendido');
reset role;

\echo '-- 3. Un usuario con sesión que NO es funcionario tampoco puede'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pruebas.esperar((select count(*) from reports) = 0, 'un no funcionario no ve reportes (RLS)');
select pruebas.esperar_error(format($q$select change_status(%L, 'atendido', 'x', 'y')$q$, :'rid'), 'no autorizado', 'un no funcionario no cambia el estado');
select pruebas.esperar_error(format($q$select add_evidence(%L, %L, 'hola')$q$, :'rid', :'rid' || '/' || gen_random_uuid() || '.jpg'),
  'no autorizado', 'un no funcionario no registra evidencia');
reset role;
reset request.jwt.claim.sub;

\echo '-- 4. La funcionaria revisa, registra evidencia y atiende'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar((select count(*) from reports) >= 31, 'la funcionaria sí ve los reportes');
select change_status(:'rid', 'en_revision', 'NOTA INTERNA SECRETA', 'Un técnico visitará el sitio');
select add_evidence(:'rid', :'rid' || '/' || gen_random_uuid() || '.jpg', 'Visita técnica realizada');
select pruebas.esperar_error(format($q$select add_evidence(%L, %L, 'mala')$q$, :'rid', :'rid' || '/%2e%2e/x.jpg'), 'no válida', 'ruta con %2e%2e rechazada');
select pruebas.esperar_error(format($q$select add_evidence(%L, %L, 'mala')$q$, :'rid', :'rid' || '/../x.jpg'), 'no válida', 'ruta con ../ rechazada');
select pruebas.esperar_error(format($q$select add_evidence(%L, %L, 'mala')$q$, :'rid', :'rid' || '/' || gen_random_uuid() || '.jpg?x=1'), 'no válida', 'ruta con ? rechazada');
select pruebas.esperar_error(format($q$select add_evidence(%L, %L, 'mala')$q$, :'rid', :'rid' || '/' || gen_random_uuid() || '.exe'), 'no válida', 'extensión no permitida rechazada');
select pruebas.esperar_error(format($q$select add_evidence(%L, %L, 'mala')$q$, :'rid', gen_random_uuid() || '/' || gen_random_uuid() || '.jpg'), 'no válida', 'ruta de otro reporte rechazada');
select pruebas.esperar_error(format($q$select add_evidence(%L, %L, 'x')$q$, :'rid', :'rid' || '/' || gen_random_uuid() || '.jpg'), 'caption', 'descripción de menos de 3 caracteres rechazada');
select change_status(:'rid', 'atendido', 'cierre interno', 'Se sembraron 20 árboles nativos');
reset role;
reset request.jwt.claim.sub;

\echo '-- 5. Lo que ve la persona: sin notas internas'
set role anon;
select get_report_tracking(:'codigo')::text as tracking \gset
select pruebas.esperar(position('INTERNA' in :'tracking') = 0 and position('cierre interno' in :'tracking') = 0, 'la nota interna nunca sale en el ticket');
select pruebas.esperar(jsonb_array_length(get_report_tracking(:'codigo') -> 'eventos') = 3, 've 3 cambios de estado');
select pruebas.esperar(jsonb_array_length(get_report_tracking(:'codigo') -> 'evidencias') = 1, 've 1 evidencia');
select pruebas.esperar(get_report_tracking(:'codigo') ->> 'puede_validar' = 'true', 'atendido: puede validar');
select get_report_tracking(:'codigo') ->> 'cierre' as cierre \gset
reset role;

\echo '-- 6. Validación: cierre equivocado, comentario en blanco y respuesta correcta'
set role anon;
select pruebas.esperar_error(format($q$select validate_report(%L, 'conforme', null, %s)$q$, :'codigo', :'cierre'::bigint + 1),
  'cambió desde que lo consultó', 'se rechaza una respuesta sobre un cierre que la persona no vio');
select pruebas.esperar_error(format($q$select validate_report(%L, 'quizas', null, %s)$q$, :'codigo', :'cierre'), 'respuesta no válida', 'respuesta inválida rechazada');
select pruebas.esperar_error(format($q$select validate_report(%L, 'conforme', %L, %s)$q$, :'codigo', repeat('x', 301), :'cierre'), 'demasiado largo', 'comentario de más de 300 caracteres rechazado');
select validate_report(:'codigo', 'conforme', E' \t\n  ', :'cierre'::bigint);
reset role;
select pruebas.esperar((select comment is null from report_validations where report_id = :'rid'), 'un comentario solo con espacios se guarda como nulo');
select pruebas.esperar((select note from report_events where report_id = :'rid' and kind = 'validacion') = 'Validación ciudadana: conforme',
  'la nota del historial no queda con un guion colgando');
set role anon;
select pruebas.esperar(get_report_tracking(:'codigo') -> 'validacion' ->> 'veredicto' = 'conforme', 'la validación queda visible');
select pruebas.esperar(get_report_tracking(:'codigo') ->> 'puede_validar' = 'false', 'ya no se puede validar de nuevo');
select pruebas.esperar_error(format($q$select validate_report(%L, 'no_conforme', null, %s)$q$, :'codigo', :'cierre'), 'ya fue validado',
  'no se puede responder dos veces');
reset role;

\echo '-- 7. Volver a guardar "atendido" NO borra la validación'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select change_status(:'rid', 'atendido', 'nota interna sobre caso cerrado', null);
select change_status(:'rid', 'atendido', 'otro clic', null);
reset role;
reset request.jwt.claim.sub;
set role anon;
select pruebas.esperar(get_report_tracking(:'codigo') ->> 'puede_validar' = 'false', 'sigue sin poder validarse otra vez');
select pruebas.esperar(get_report_tracking(:'codigo') -> 'validacion' ->> 'veredicto' = 'conforme', 'la validación conforme sigue en pie');
select pruebas.esperar(jsonb_array_length(get_report_tracking(:'codigo') -> 'eventos') = 4, 'las notas internas repetidas no llenan el ticket de eventos');
select pruebas.esperar(get_report_tracking(:'codigo') ->> 'nota_publica' = 'Se sembraron 20 árboles nativos', 'una nota interna no borra la nota pública');
reset role;
select pruebas.esperar((select count(*) from report_events where report_id = :'rid' and kind = 'nota') = 2, 'quedan guardadas como notas (kind = nota)');

\echo '-- 8. Reapertura: nuevo cierre, "no conforme", nota pública al día'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select change_status(:'rid', 'en_revision', 're-revisión', null);
select pruebas.esperar((select public_note is null from reports where id = :'rid'), 'al cambiar de estado sin nota pública, la anterior deja de mostrarse');
select change_status(:'rid', 'atendido', 'segundo cierre', 'Se reforzó la vigilancia');
reset role;
reset request.jwt.claim.sub;
set role anon;
select pruebas.esperar(get_report_tracking(:'codigo') ->> 'puede_validar' = 'true', 'un cierre nuevo se puede validar');
select get_report_tracking(:'codigo') ->> 'cierre' as cierre2 \gset
select pruebas.esperar(:'cierre2'::bigint > :'cierre'::bigint, 'el cierre nuevo tiene otro número');
select validate_report(:'codigo', 'no_conforme', 'Sigue igual', :'cierre2'::bigint);
select pruebas.esperar(get_report_tracking(:'codigo') ->> 'estado' = 'en_revision', 'con "no conforme" el caso vuelve a revisión');
select pruebas.esperar(get_report_tracking(:'codigo') ->> 'nota_publica' like 'El ciudadano indicó que el problema continúa%',
  'la nota pública ya no dice que la acción se cumplió');
select get_report_tracking(:'codigo')::text as tracking2 \gset
select pruebas.esperar(position('re-revisión' in :'tracking2') = 0 and position('segundo cierre' in :'tracking2') = 0,
  'un cambio de estado sin nota pública no filtra la nota interna');
select pruebas.esperar(jsonb_array_length(get_report_tracking(:'codigo') -> 'eventos') = 7, 'cada evento visible tiene un texto público');
reset role;

\echo '-- 9. Funciones y permisos'
select pruebas.esperar((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.prosecdef and not coalesce('search_path=public, pg_temp' = any (p.proconfig), false)) = 0,
  'todas las funciones SECURITY DEFINER fijan search_path con pg_temp al final');
select pruebas.esperar(not has_function_privilege('anon', 'change_status(uuid, report_status, text, text)', 'execute'), 'anon no ejecuta change_status');
select pruebas.esperar(not has_function_privilege('anon', 'add_evidence(uuid, text, text)', 'execute'), 'anon no ejecuta add_evidence');
select pruebas.esperar(has_function_privilege('anon', 'get_report_tracking(text)', 'execute'), 'anon sí consulta el ticket');
select pruebas.esperar(has_function_privilege('anon', 'validate_report(text, text, text, bigint)', 'execute'), 'anon sí valida con su ticket');
select pruebas.esperar(to_regprocedure('validate_report(text, text, text)') is null, 'no quedó la versión antigua de validate_report');

\echo '-- 10. Fotos: quién puede subir qué'
set role anon;
select pruebas.esperar_error(format($q$insert into storage.objects (bucket_id, name) values ('report-evidence', %L)$q$, :'rid' || '/' || gen_random_uuid() || '.jpg'),
  'row-level security', 'anon no sube evidencia');
insert into storage.objects (bucket_id, name) values ('report-photos', gen_random_uuid() || '.jpg');
select pruebas.esperar(true, 'anon sí sube la foto de su reporte');
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pruebas.esperar_error(format($q$insert into storage.objects (bucket_id, name) values ('report-evidence', %L)$q$, :'rid' || '/' || gen_random_uuid() || '.jpg'),
  'row-level security', 'un no funcionario no sube evidencia');
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into storage.objects (bucket_id, name) values ('report-evidence', :'rid' || '/' || gen_random_uuid() || '.jpg');
select pruebas.esperar(true, 'la funcionaria sí sube evidencia con el nombre correcto');
select pruebas.esperar_error($q$insert into storage.objects (bucket_id, name) values ('report-evidence', '../secreto.jpg')$q$,
  'row-level security', 'la funcionaria no puede usar un nombre fuera del formato');
select pruebas.esperar_error(format($q$insert into storage.objects (bucket_id, name) values ('report-evidence', %L)$q$, :'rid' || '/' || gen_random_uuid() || '.php'),
  'row-level security', 'ni una extensión no permitida');
reset role;
reset request.jwt.claim.sub;
\echo '-- 11. Con datos en las tablas, siguen cerradas (una tabla vacía daría 0 filas aunque estuviera abierta)'
select pruebas.esperar((select count(*) from reports) > 0 and (select count(*) from report_events) > 0
                        and (select count(*) from report_evidence) > 0 and (select count(*) from report_validations) > 0
                        and (select count(*) from staff) > 0, 'precondición: todas las tablas tienen filas');
set role anon;
select pruebas.esperar((select count(*) from reports) + (select count(*) from report_events) + (select count(*) from report_evidence)
                        + (select count(*) from report_validations) + (select count(*) from staff) = 0, 'anon no ve ninguna fila de ninguna tabla');
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pruebas.esperar((select count(*) from reports) + (select count(*) from report_events) + (select count(*) from report_evidence)
                        + (select count(*) from report_validations) + (select count(*) from staff) = 0, 'un no funcionario no ve ninguna fila de ninguna tabla');
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar((select count(*) from staff) = 1, 'cada funcionaria ve solo su propia fila de staff');
select pruebas.esperar((select count(*) from report_evidence) > 0 and (select count(*) from report_validations) > 0, 'la funcionaria sí ve evidencia y validaciones');
reset role;
reset request.jwt.claim.sub;

\echo '-- 12. Un reporte que dejó de estar atendido ya no se puede validar con su cierre anterior'
set role anon;
select create_report('quema', 'Reporte para probar el cierre reabierto', 7.8, -76.6, null) as codigo3 \gset
reset role;
select id as rid3 from reports where tracking_code = :'codigo3' \gset
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select change_status(:'rid3', 'atendido', 'cierre', 'Atendido');
reset role;
reset request.jwt.claim.sub;
set role anon;
select get_report_tracking(:'codigo3') ->> 'cierre' as cierre3 \gset
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select change_status(:'rid3', 'en_revision', 'se reabrió', null);
reset role;
reset request.jwt.claim.sub;
set role anon;
select pruebas.esperar_error(format($q$select validate_report(%L, 'conforme', null, %s)$q$, :'codigo3', :'cierre3'), 'no está esperando validación',
  'no se valida un cierre de un reporte que ya no está atendido');
reset role;
\echo '-- Seguimiento: TODO OK'
