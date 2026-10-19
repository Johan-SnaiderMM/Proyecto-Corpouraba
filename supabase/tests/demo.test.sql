-- Pruebas de los datos de demostración (supabase/demo.sql).
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

\echo '-- Datos de demostración'
select pruebas.esperar((select count(*) from reports where tracking_code like 'DEMO%') = 6, 'hay 6 reportes DEMO (aunque se ejecute dos veces)');
select pruebas.esperar((select count(*) from report_evidence e join reports r on r.id = e.report_id where r.tracking_code like 'DEMO%') = 7, 'hay 7 evidencias DEMO');

set role anon;
select pruebas.esperar(get_report_tracking('demo-0001-vali-dado') ->> 'estado' = 'atendido'
                       and get_report_tracking('DEMO0001VALIDADO') -> 'validacion' ->> 'veredicto' = 'conforme'
                       and get_report_tracking('DEMO0001VALIDADO') ->> 'puede_validar' = 'false', 'DEMO-0001: atendido y validado como conforme');
select pruebas.esperar(get_report_tracking('DEMO0002PORVALID') ->> 'puede_validar' = 'true', 'DEMO-0002: espera la validación de la persona');
select pruebas.esperar(get_report_tracking('DEMO0003REABIERT') ->> 'estado' = 'en_revision'
                       and get_report_tracking('DEMO0003REABIERT') -> 'validacion' ->> 'veredicto' = 'no_conforme'
                       and jsonb_array_length(get_report_tracking('DEMO0003REABIERT') -> 'evidencias') = 2, 'DEMO-0003: reabierto tras un "no conforme", con 2 evidencias');
select pruebas.esperar(get_report_tracking('DEMO0004RECIBIDO') ->> 'estado' = 'recibido', 'DEMO-0004: recién recibido');
select pruebas.esperar(get_report_tracking('DEMO0005DESCARTA') ->> 'estado' = 'descartado', 'DEMO-0005: descartado');
select pruebas.esperar(get_report_tracking('DEMO0006REVISION') ->> 'estado' = 'en_revision'
                       and jsonb_array_length(get_report_tracking('DEMO0006REVISION') -> 'evidencias') = 1, 'DEMO-0006: en revisión con 1 evidencia');
select pruebas.esperar(position('Asignado a la Territorial' in get_report_tracking('DEMO0001VALIDADO')::text) = 0, 'las notas internas de la demo tampoco salen en el ticket');

reset role;

select pruebas.esperar((select count(*) from reports) >= 36, 'los DEMO conviven con los datos de prueba normales');
select pruebas.esperar((select max(created_at) from reports where tracking_code like 'DEMO%') <= now(), 'ninguna fecha DEMO queda en el futuro');
\echo '-- Coherencia de los datos DEMO'
select pruebas.esperar((select count(*) from report_evidence e join reports r on r.id = e.report_id
                        where r.tracking_code like 'DEMO%' and e.storage_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$') = 0,
  'toda ruta de evidencia DEMO tiene el formato <id del reporte>/<id>.jpg');
select pruebas.esperar((select count(*) from report_evidence e join reports r on r.id = e.report_id
                        where r.tracking_code like 'DEMO%' and e.storage_path not like r.id::text || '/%') = 0,
  'cada evidencia DEMO está bajo la carpeta de su propio reporte');
select pruebas.esperar((select count(*) from reports r where r.tracking_code like 'DEMO%'
                        and r.updated_at <> greatest((select max(created_at) from report_events where report_id = r.id),
                                                     coalesce((select max(created_at) from report_evidence where report_id = r.id), '-infinity'))) = 0,
  'updated_at de cada reporte DEMO es el de su última actividad');
select pruebas.esperar((select count(*) from report_events e join reports r on r.id = e.report_id where r.tracking_code like 'DEMO%' and e.created_at > now()) = 0
                       and (select count(*) from report_evidence e join reports r on r.id = e.report_id where r.tracking_code like 'DEMO%' and e.created_at > now()) = 0,
  'ningún evento ni evidencia DEMO está en el futuro');
select pruebas.esperar((select count(*) from reports r where r.tracking_code like 'DEMO%'
                        and r.created_at > (select min(created_at) from report_events where report_id = r.id)) = 0,
  'cada reporte DEMO se crea antes que su primer evento');
\echo '-- Ensayo de la validación en vivo'
-- Se ensaya la validación en vivo sobre DEMO-0002
select get_report_tracking('DEMO0002PORVALID') ->> 'cierre' as cierre \gset
select validate_report('DEMO0002PORVALID', 'conforme', 'Gracias', :'cierre'::bigint);
select pruebas.esperar(get_report_tracking('DEMO0002PORVALID') -> 'validacion' ->> 'veredicto' = 'conforme', 'se puede validar DEMO-0002 en vivo');
reset role;
\echo '-- Demo: TODO OK'
