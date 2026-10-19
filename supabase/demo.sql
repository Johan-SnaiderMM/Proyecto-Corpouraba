-- Datos de demostración con historia: 6 reportes inventados en municipios del Urabá, en distintos momentos
-- del proceso (con evidencia, validaciones y un caso reabierto). Sirven para ensayar la presentación.
--
-- Cómo usarlo (después de schema.sql, seguimiento.sql y de registrar al menos un funcionario en "staff"):
--   1. Ejecute este archivo en el SQL Editor de Supabase. Se puede repetir: borra y vuelve a crear los DEMO.
--   2. Suba las fotos de evidencia con:  npm run demo:fotos   (ver README, sección "Datos de demostración").
--
-- Códigos de ticket para la demo (se escriben con o sin guiones):
--   DEMO-0001-VALI-DADO  atendido y validado como conforme por la persona
--   DEMO-0002-PORV-ALID  atendido, a la espera de que la persona valide  (úselo para validar en vivo)
--   DEMO-0003-REAB-IERT  la persona dijo "no conforme": el caso volvió a revisión y hubo una segunda visita
--   DEMO-0004-RECI-BIDO  recién recibido
--   DEMO-0005-DESC-ARTA  descartado
--   DEMO-0006-REVI-SION  en revisión, con una evidencia
--
-- Para quitarlos:  delete from reports where tracking_code like 'DEMO%';
-- Son códigos fáciles de adivinar a propósito: no los use en un proyecto con datos reales.

do $$
declare
  v_staff uuid;
  v_cierre bigint;
begin
  select user_id into v_staff from staff limit 1;
  if v_staff is null then
    raise exception 'Primero registre un funcionario en la tabla staff (ver README, paso 4).';
  end if;

  delete from reports where tracking_code like 'DEMO%';

  -- ===== DEMO0001VALIDADO =====
  insert into reports (id, tracking_code, type, description, lat, lng, status, public_note, created_at, updated_at)
  values ('de000001-0000-4000-8000-000000000001', 'DEMO0001VALIDADO', 'vertimiento', 'DEMO · Salen aguas turbias y con espuma de un tubo hacia la quebrada, con mal olor desde hace una semana.', 7.8816, -76.6342, 'atendido', 'Se ordenó suspender el vertimiento y se instaló un sistema de tratamiento de aguas', date_trunc('day', now()) - interval '10 days' + interval '9 hours', date_trunc('day', now()) - interval '4 days' + interval '18 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000001-0000-4000-8000-000000000001', 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', null, date_trunc('day', now()) - interval '10 days' + interval '9 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000001-0000-4000-8000-000000000001', 'en_revision', 'Asignado a la Territorial Centro', 'Un técnico visitará el sitio esta semana', 'estado', v_staff, date_trunc('day', now()) - interval '9 days' + interval '10 hours');
  insert into report_evidence (report_id, storage_path, caption, staff_id, created_at)
  values ('de000001-0000-4000-8000-000000000001', 'de000001-0000-4000-8000-000000000001/ee010100-0000-4000-8000-000000000000.jpg', 'Toma de muestras de agua en la quebrada', v_staff, date_trunc('day', now()) - interval '7 days' + interval '11 hours');
  insert into report_evidence (report_id, storage_path, caption, staff_id, created_at)
  values ('de000001-0000-4000-8000-000000000001', 'de000001-0000-4000-8000-000000000001/ee010200-0000-4000-8000-000000000000.jpg', 'Inspección del punto de vertimiento', v_staff, date_trunc('day', now()) - interval '6 days' + interval '15 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000001-0000-4000-8000-000000000001', 'atendido', 'Se ordenó suspender el vertimiento', 'Se ordenó suspender el vertimiento y se instaló un sistema de tratamiento de aguas', 'estado', v_staff, date_trunc('day', now()) - interval '5 days' + interval '16 hours')
  returning id into v_cierre;
  insert into report_validations (report_id, event_id, verdict, comment, created_at)
  values ('de000001-0000-4000-8000-000000000001', v_cierre, 'conforme', 'Ya no huele ni sale espuma. Gracias.', date_trunc('day', now()) - interval '4 days' + interval '18 hours');
  insert into report_events (report_id, status, note, public_note, kind, created_at)
  values ('de000001-0000-4000-8000-000000000001', 'atendido', 'Validación ciudadana: conforme — Ya no huele ni sale espuma. Gracias.', 'El ciudadano confirmó que la acción se cumplió.', 'validacion', date_trunc('day', now()) - interval '4 days' + interval '18 hours');

  -- ===== DEMO0002PORVALID =====
  insert into reports (id, tracking_code, type, description, lat, lng, status, public_note, created_at, updated_at)
  values ('de000002-0000-4000-8000-000000000001', 'DEMO0002PORVALID', 'tala', 'DEMO · Están talando árboles grandes junto a la orilla del río en un predio sin letrero ni permiso visible.', 7.6671, -76.6819, 'atendido', 'Se impuso una medida de compensación y se verificó la siembra de los árboles', date_trunc('day', now()) - interval '8 days' + interval '8 hours', date_trunc('day', now()) - interval '3 days' + interval '16 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000002-0000-4000-8000-000000000001', 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', null, date_trunc('day', now()) - interval '8 days' + interval '8 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000002-0000-4000-8000-000000000001', 'en_revision', 'Asignado a la Territorial Urrao', 'Un técnico visitará el predio', 'estado', v_staff, date_trunc('day', now()) - interval '7 days' + interval '9 hours');
  insert into report_evidence (report_id, storage_path, caption, staff_id, created_at)
  values ('de000002-0000-4000-8000-000000000001', 'de000002-0000-4000-8000-000000000001/ee020100-0000-4000-8000-000000000000.jpg', 'Visita al predio y verificación de la tala', v_staff, date_trunc('day', now()) - interval '6 days' + interval '10 hours');
  insert into report_evidence (report_id, storage_path, caption, staff_id, created_at)
  values ('de000002-0000-4000-8000-000000000001', 'de000002-0000-4000-8000-000000000001/ee020200-0000-4000-8000-000000000000.jpg', 'Siembra de 30 árboles nativos como compensación', v_staff, date_trunc('day', now()) - interval '4 days' + interval '14 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000002-0000-4000-8000-000000000001', 'atendido', 'Compensación verificada', 'Se impuso una medida de compensación y se verificó la siembra de los árboles', 'estado', v_staff, date_trunc('day', now()) - interval '3 days' + interval '16 hours')
  returning id into v_cierre;

  -- ===== DEMO0003REABIERT =====
  insert into reports (id, tracking_code, type, description, lat, lng, status, public_note, created_at, updated_at)
  values ('de000003-0000-4000-8000-000000000001', 'DEMO0003REABIERT', 'quema', 'DEMO · Queman rastrojo y plástico detrás de una finca; el humo llega hasta las casas cercanas.', 7.7573, -76.6528, 'en_revision', 'Se programó una visita de control para esta semana', date_trunc('day', now()) - interval '12 days' + interval '9 hours', date_trunc('day', now()) - interval '6 days' + interval '13 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000003-0000-4000-8000-000000000001', 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', null, date_trunc('day', now()) - interval '12 days' + interval '9 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000003-0000-4000-8000-000000000001', 'en_revision', 'Asignado a la Territorial Caribe', 'Un técnico visitará la zona', 'estado', v_staff, date_trunc('day', now()) - interval '11 days' + interval '10 hours');
  insert into report_evidence (report_id, storage_path, caption, staff_id, created_at)
  values ('de000003-0000-4000-8000-000000000001', 'de000003-0000-4000-8000-000000000001/ee030100-0000-4000-8000-000000000000.jpg', 'Visita a la finca y verificación del foco de quema', v_staff, date_trunc('day', now()) - interval '10 days' + interval '11 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000003-0000-4000-8000-000000000001', 'atendido', 'Foco apagado', 'Se apagó el foco y se notificó al propietario sobre la prohibición de quemas', 'estado', v_staff, date_trunc('day', now()) - interval '9 days' + interval '15 hours')
  returning id into v_cierre;
  insert into report_validations (report_id, event_id, verdict, comment, created_at)
  values ('de000003-0000-4000-8000-000000000001', v_cierre, 'no_conforme', 'Volvieron a quemar el lunes', date_trunc('day', now()) - interval '8 days' + interval '17 hours');
  insert into report_events (report_id, status, note, public_note, kind, created_at)
  values ('de000003-0000-4000-8000-000000000001', 'en_revision', 'Validación ciudadana: NO conforme — Volvieron a quemar el lunes', 'El ciudadano indicó que el problema continúa; el caso vuelve a revisión.', 'validacion', date_trunc('day', now()) - interval '8 days' + interval '17 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000003-0000-4000-8000-000000000001', 'en_revision', 'Programar visita de control', 'Se programó una visita de control para esta semana', 'nota', v_staff, date_trunc('day', now()) - interval '7 days' + interval '9 hours');
  insert into report_evidence (report_id, storage_path, caption, staff_id, created_at)
  values ('de000003-0000-4000-8000-000000000001', 'de000003-0000-4000-8000-000000000001/ee030200-0000-4000-8000-000000000000.jpg', 'Segunda visita de control al predio', v_staff, date_trunc('day', now()) - interval '6 days' + interval '13 hours');

  -- ===== DEMO0004RECIBIDO =====
  insert into reports (id, tracking_code, type, description, lat, lng, status, public_note, created_at, updated_at)
  values ('de000004-0000-4000-8000-000000000001', 'DEMO0004RECIBIDO', 'residuos', 'DEMO · Dejaron escombros y bolsas de basura al lado del camino que va a la escuela.', 8.0935, -76.7285, 'recibido', 'Reporte recibido', now() - interval '3 hours', now() - interval '3 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000004-0000-4000-8000-000000000001', 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', null, now() - interval '3 hours');

  -- ===== DEMO0005DESCARTA =====
  insert into reports (id, tracking_code, type, description, lat, lng, status, public_note, created_at, updated_at)
  values ('de000005-0000-4000-8000-000000000001', 'DEMO0005DESCARTA', 'fauna', 'DEMO · Vi a unas personas con jaulas ofreciendo loros a la orilla de la carretera.', 8.4278, -76.7855, 'descartado', 'En la visita no se encontró la actividad reportada, por eso se cierra el caso', date_trunc('day', now()) - interval '6 days' + interval '8 hours', date_trunc('day', now()) - interval '4 days' + interval '11 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000005-0000-4000-8000-000000000001', 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', null, date_trunc('day', now()) - interval '6 days' + interval '8 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000005-0000-4000-8000-000000000001', 'en_revision', 'Asignado a la Territorial Caribe', 'Un técnico revisará el lugar', 'estado', v_staff, date_trunc('day', now()) - interval '5 days' + interval '9 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000005-0000-4000-8000-000000000001', 'descartado', 'Sin hallazgos en la visita', 'En la visita no se encontró la actividad reportada, por eso se cierra el caso', 'estado', v_staff, date_trunc('day', now()) - interval '4 days' + interval '11 hours');

  -- ===== DEMO0006REVISION =====
  insert into reports (id, tracking_code, type, description, lat, lng, status, public_note, created_at, updated_at)
  values ('de000006-0000-4000-8000-000000000001', 'DEMO0006REVISION', 'tala', 'DEMO · Cortaron mangle cerca de la playa para hacer un potrero.', 8.0911, -76.7351, 'en_revision', 'El caso fue asignado a un técnico', date_trunc('day', now()) - interval '3 days' + interval '8 hours', date_trunc('day', now()) - interval '1 days' + interval '10 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000006-0000-4000-8000-000000000001', 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', null, date_trunc('day', now()) - interval '3 days' + interval '8 hours');
  insert into report_events (report_id, status, note, public_note, kind, staff_id, created_at)
  values ('de000006-0000-4000-8000-000000000001', 'en_revision', 'Asignado a la Territorial Nutibara', 'El caso fue asignado a un técnico', 'estado', v_staff, date_trunc('day', now()) - interval '2 days' + interval '9 hours');
  insert into report_evidence (report_id, storage_path, caption, staff_id, created_at)
  values ('de000006-0000-4000-8000-000000000001', 'de000006-0000-4000-8000-000000000001/ee060100-0000-4000-8000-000000000000.jpg', 'Ubicación del punto afectado registrada con GPS', v_staff, date_trunc('day', now()) - interval '1 days' + interval '10 hours');

end $$;
