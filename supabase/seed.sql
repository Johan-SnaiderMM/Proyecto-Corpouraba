-- Datos de prueba: 30 reportes inventados alrededor de Apartadó (7.88, -76.63).
-- Ejecutar después de schema.sql. Se pueden borrar con:
--   delete from reports where description like 'Reporte de prueba%';

insert into reports (tracking_code, type, description, lat, lng, status)
select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
       (array['tala', 'quema', 'vertimiento', 'fauna', 'residuos', 'otro'])[1 + (i % 6)]::report_type,
       'Reporte de prueba número ' || i,
       7.88 + (random() - 0.5) * 0.4,
       -76.63 + (random() - 0.5) * 0.4,
       (array['recibido', 'en_revision', 'atendido', 'descartado'])[1 + (i % 4)]::report_status
from generate_series(1, 30) as i;

insert into report_events (report_id, status, note)
select id, status, 'Dato de prueba'
from reports
where description like 'Reporte de prueba%';
