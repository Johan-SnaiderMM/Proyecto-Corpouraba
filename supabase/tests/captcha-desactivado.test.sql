-- Pruebas después de DESACTIVAR el captcha (supabase/captcha-desactivar.sql): todo vuelve a como estaba.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

\echo '-- Captcha desactivado: se puede crear reportes directamente otra vez'
set role anon;
select create_report('residuos', 'Reporte directo, sin captcha', 7.8, -76.6, null) as codigo \gset
select pruebas.esperar(:'codigo' ~ '^[0-9A-F]{16}$', 'anon vuelve a crear reportes');
insert into storage.objects (bucket_id, name) values ('report-photos', gen_random_uuid() || '.jpg');
select pruebas.esperar(true, 'anon vuelve a subir fotos');
reset role;
set role authenticated;
select create_report('residuos', 'Reporte directo con sesión', 7.8, -76.6, null);
reset role;
select pruebas.esperar((select count(*) from pg_policies where tablename = 'objects' and policyname = 'subir_fotos') = 1,
  'la política subir_fotos existe una sola vez (se puede repetir sin duplicarla)');
\echo '-- Captcha desactivado: TODO OK'
