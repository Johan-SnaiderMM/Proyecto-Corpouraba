-- Pruebas con el captcha ACTIVADO (después de ejecutar supabase/captcha.sql).
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

\echo '-- Captcha activado: solo la función del servidor puede crear reportes'
set role anon;
select pruebas.esperar_error($q$select create_report('tala', 'Intento directo de un robot', 7.8, -76.6, null)$q$, 'permission denied',
  'anon ya no puede llamar a create_report directamente');
select pruebas.esperar_error(format($q$insert into storage.objects (bucket_id, name) values ('report-photos', %L)$q$, gen_random_uuid() || '.jpg'),
  'row-level security', 'anon ya no puede subir fotos directamente');
reset role;

set role authenticated;
select pruebas.esperar_error($q$select create_report('tala', 'Intento con una sesión cualquiera', 7.8, -76.6, null)$q$, 'permission denied',
  'tampoco un usuario con sesión puede llamar a create_report');
reset role;

set role service_role;
select create_report('quema', 'Reporte creado por la función del servidor', 7.8, -76.6, null) as codigo \gset
reset role;
select pruebas.esperar(:'codigo' ~ '^[0-9A-F]{16}$', 'service_role (la función de Vercel) sí crea reportes');
select pruebas.esperar(has_function_privilege('service_role', 'create_report(report_type, text, double precision, double precision, text)', 'execute'),
  'service_role conserva el permiso');

\echo '-- Lo demás sigue funcionando con el captcha activado'
set role anon;
select pruebas.esperar(get_report_tracking(:'codigo') ->> 'estado' = 'recibido', 'anon sigue consultando su ticket');
select pruebas.esperar(has_function_privilege('anon', 'validate_report(text, text, text, bigint)', 'execute'), 'anon sigue validando con su ticket');
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into storage.objects (bucket_id, name) values ('report-evidence', gen_random_uuid() || '/' || gen_random_uuid() || '.jpg');
select pruebas.esperar(true, 'la funcionaria sigue subiendo evidencia');
reset role;
reset request.jwt.claim.sub;
\echo '-- Captcha activado: TODO OK'
