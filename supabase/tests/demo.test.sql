-- Pruebas de los datos de demostración (supabase/demo.sql).
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

\echo '-- Datos de demostración'
select pruebas.esperar((select count(*) from reports where tracking_code like 'DEMO%') = 8, 'hay 8 reportes DEMO (aunque se ejecute dos veces)');
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

select pruebas.esperar((select count(*) from reports) >= 38, 'los DEMO conviven con los datos de prueba normales');
select pruebas.esperar((select max(created_at) from reports where tracking_code like 'DEMO%') <= now(), 'ninguna fecha DEMO queda en el futuro');
\echo '-- Coherencia de los datos DEMO'
select pruebas.esperar((select count(*) from report_evidence e join reports r on r.id = e.report_id
                        where r.tracking_code like 'DEMO%' and e.storage_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$') = 0,
  'toda ruta de evidencia DEMO tiene el formato <id del reporte>/<id>.jpg');
select pruebas.esperar((select count(*) from report_evidence e join reports r on r.id = e.report_id
                        where r.tracking_code like 'DEMO%' and e.storage_path not like r.id::text || '/%') = 0,
  'cada evidencia DEMO está bajo la carpeta de su propio reporte');
select pruebas.esperar((select count(*) from reports r where r.tracking_code like 'DEMO%'
                        and r.updated_at <> greatest((select max(created_at) from report_events where report_id = r.id and kind <> 'asignacion'),
                                                     coalesce((select max(created_at) from report_evidence where report_id = r.id), '-infinity'))) = 0,
  'updated_at de cada reporte DEMO es el de su última actividad');
select pruebas.esperar((select count(*) from report_events e join reports r on r.id = e.report_id where r.tracking_code like 'DEMO%' and e.created_at > now()) = 0
                       and (select count(*) from report_evidence e join reports r on r.id = e.report_id where r.tracking_code like 'DEMO%' and e.created_at > now()) = 0,
  'ningún evento ni evidencia DEMO está en el futuro');
select pruebas.esperar((select count(*) from reports r where r.tracking_code like 'DEMO%'
                        and r.created_at > (select min(created_at) from report_events where report_id = r.id)) = 0,
  'cada reporte DEMO se crea antes que su primer evento');
\echo '-- Responsables y casos que necesitan atención'
select pruebas.esperar((select count(*) from reports where tracking_code like 'DEMO%' and assigned_to is not null) = 4, 'cuatro casos DEMO tienen responsable');
select pruebas.esperar((select count(*) from reports where tracking_code in ('DEMO0004RECIBIDO', 'DEMO0005DESCARTA', 'DEMO0007SINATEND', 'DEMO0008ESTANCAD') and assigned_to is not null) = 0,
  'los demás no tienen responsable');
select pruebas.esperar((select count(*) from report_events e join reports r on r.id = e.report_id where r.tracking_code like 'DEMO%' and e.kind = 'asignacion') = 4, 'cada asignación DEMO deja su aviso en el historial interno');
select pruebas.esperar((select count(*) from report_events e join reports r on r.id = e.report_id
                        where r.tracking_code like 'DEMO%' and e.kind = 'asignacion' and e.created_at < r.created_at) = 0, 'ninguna asignación es anterior al reporte');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar((select count(*) from report_attention() a join reports r on r.id = a.report_id where r.tracking_code like 'DEMO%') = 3,
  'exactamente 3 casos DEMO necesitan atención');
select pruebas.esperar((select motivos from report_attention() a join reports r on r.id = a.report_id where r.tracking_code = 'DEMO0003REABIERT') = array['reabierto'], 'DEMO-0003: reabierto');
select pruebas.esperar((select motivos from report_attention() a join reports r on r.id = a.report_id where r.tracking_code = 'DEMO0007SINATEND') = array['sin_atender'], 'DEMO-0007: sin atender');
select pruebas.esperar((select motivos from report_attention() a join reports r on r.id = a.report_id where r.tracking_code = 'DEMO0008ESTANCAD') = array['estancado'], 'DEMO-0008: sin movimiento');
reset role;
reset request.jwt.claim.sub;

\echo '-- Ensayo de la validación en vivo'
-- Se ensaya la validación en vivo sobre DEMO-0002
select get_report_tracking('DEMO0002PORVALID') ->> 'cierre' as cierre \gset
select validate_report('DEMO0002PORVALID', 'conforme', 'Gracias', :'cierre'::bigint);
select pruebas.esperar(get_report_tracking('DEMO0002PORVALID') -> 'validacion' ->> 'veredicto' = 'conforme', 'se puede validar DEMO-0002 en vivo');
reset role;
\echo '-- Demo: TODO OK'
