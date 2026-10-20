-- Pruebas a fondo de report_attention(): plazos por omisión, bordes exactos, empates de fecha, casos sin eventos,
-- asignaciones que no cuentan como movimiento y zonas horarias. Va después de asignacion.test.sql (usa sus funcionarios).
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

-- Crea un reporte (sin eventos) con el estado y la edad dadas. Devuelve su id.
create function pruebas.caso(p_estado report_status, p_edad interval, p_desc text) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into reports (tracking_code, type, description, lat, lng, status, created_at, updated_at)
  values (upper(substr(md5(random()::text), 1, 16)), 'tala', p_desc || ' (prueba de atención)', 7.8, -76.6, p_estado, now() - p_edad, now() - p_edad)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function pruebas.caso(report_status, interval, text) to authenticated;

-- Agrega un evento con fecha exacta. Devuelve su id.
create function pruebas.evento(p_reporte uuid, p_estado report_status, p_clase text, p_cuando timestamptz) returns bigint
language sql as $$
  insert into report_events (report_id, status, note, public_note, kind, created_at)
  values (p_reporte, p_estado, 'prueba', case when p_clase = 'validacion' then 'p' end, p_clase, p_cuando) returning id;
$$;

\echo '-- Plazos por omisión (2 y 7 días) y reportes sin ningún evento'
select pruebas.caso('recibido', interval '2 days 12 hours', 'a') as a \gset
select pruebas.caso('en_revision', interval '7 days 12 hours', 'b') as b \gset
select pruebas.caso('recibido', interval '2 days 14 hours', 'c') as c \gset
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar(exists (select 1 from report_attention() where report_id = :'a' and motivos = array['sin_atender']),
  'un reporte recibido SIN ningún evento y de 2,5 días aparece como "sin atender" con los plazos por omisión');
select pruebas.esperar(not exists (select 1 from report_attention(3, 7) where report_id = :'a'), '...y no con un plazo de 3 días');
select pruebas.esperar(exists (select 1 from report_attention() where report_id = :'b' and motivos = array['estancado']), 'en revisión 7,5 días: "estancado" por omisión');
select pruebas.esperar(not exists (select 1 from report_attention(2, 8) where report_id = :'b'), '...y no con un plazo de 8 días');
select pruebas.esperar((select dias from report_attention() where report_id = :'c') = 2, '"dias" se redondea hacia abajo (2,6 días = 2)');
select pruebas.esperar((select dias from report_attention() where report_id = :'b') = 7, '"dias" de 7,5 días = 7');
select pruebas.esperar(not exists (select 1 from report_attention(null, null) where report_id in (:'a', :'b', :'c')), 'plazos nulos: no se marca nada (y no revienta)');

\echo '-- El resultado no depende de la zona horaria de la sesión (zonas sin cambio de horario)'
set time zone 'Asia/Tokyo';
select pruebas.esperar((select count(*) from report_attention() where report_id in (:'a', :'b', :'c')) = 3, 'misma respuesta en Asia/Tokyo');
set time zone 'America/Bogota';
select pruebas.esperar((select count(*) from report_attention() where report_id in (:'a', :'b', :'c')) = 3, 'misma respuesta en America/Bogota');
reset time zone;
reset role;
reset request.jwt.claim.sub;

\echo '-- Cambio de horario: los plazos son de 24 horas reales, no "días de calendario" de la zona de la sesión'
-- Se inventa una zona que adelantó el reloj una hora AYER a las 02:00 (hora de verano), así que "hace 2 días de calendario"
-- son solo 47 horas. Con make_interval(days => 2) un caso de 47,5 horas saldría como "sin atender" con dias = 1.
select ayer, (extract(doy from ayer)::int - case when (extract(year from ayer)::int % 4 = 0 and (extract(year from ayer)::int % 100 <> 0 or extract(year from ayer)::int % 400 = 0))
                                                   and extract(month from ayer) >= 3 then 1 else 0 end) as dia_j,
       (extract(year from ayer) = extract(year from now() at time zone 'utc') and not (extract(month from ayer) = 2 and extract(day from ayer) = 29)) as se_puede
from (select (now() at time zone 'utc')::date - 1 as ayer) x \gset
\if :se_puede
select format('XXX0YYY-1,J%s,J365', :dia_j) as zona \gset
select pruebas.caso('recibido', interval '47 hours 30 minutes', 'horario') as h1 \gset
select pruebas.caso('recibido', interval '48 hours 30 minutes', 'horario') as h2 \gset
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select set_config('TimeZone', :'zona', false) \g /dev/null
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'h1'), 'zona con cambio de horario: 47,5 horas NO son "más de 2 días"');
select pruebas.esperar((select dias from report_attention() where report_id = :'h2') = 2, 'zona con cambio de horario: 48,5 horas sí, con dias = 2');
reset time zone;
reset role;
reset request.jwt.claim.sub;
\else
\echo 'omitida: ayer no es un día representable como zona de prueba'
\endif

\echo '-- Bordes exactos (en una sola transacción, now() no cambia)'
begin;
select pruebas.caso('recibido', interval '2 days', 'borde 2d') as e2 \gset
select pruebas.caso('recibido', interval '2 days' - interval '1 second', 'borde 2d-1s') as e2m \gset
select pruebas.caso('recibido', interval '2 days' + interval '1 second', 'borde 2d+1s') as e2p \gset
select pruebas.caso('en_revision', interval '7 days', 'borde 7d') as e7 \gset
select pruebas.caso('en_revision', interval '7 days' - interval '1 second', 'borde 7d-1s') as e7m \gset
select pruebas.caso('en_revision', interval '7 days' + interval '1 second', 'borde 7d+1s') as e7p \gset
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'e2'), 'recibido justo hace 2 días: todavía no ("más de 2 días")');
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'e2m'), 'recibido hace 2 días menos 1 segundo: no');
select pruebas.esperar(exists (select 1 from report_attention() where report_id = :'e2p'), 'recibido hace 2 días y 1 segundo: sí');
select pruebas.esperar(exists (select 1 from report_attention() where report_id = :'e7'), 'en revisión justo hace 7 días: sí ("7 o más días", como dice el README)');
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'e7m'), 'en revisión hace 7 días menos 1 segundo: no');
select pruebas.esperar(exists (select 1 from report_attention() where report_id = :'e7p'), 'en revisión hace 7 días y 1 segundo: sí');
rollback;

\echo '-- Eventos con la MISMA fecha exacta: manda el último por id'
begin;
select pruebas.caso('en_revision', interval '1 hour', 'empate A') as t1 \gset
select pruebas.caso('en_revision', interval '1 hour', 'empate B') as t2 \gset
select now() as ahora \gset
select pruebas.evento(:'t1', 'recibido', 'estado', :'ahora') \gset
select pruebas.evento(:'t1', 'en_revision', 'estado', :'ahora') \gset
select pruebas.evento(:'t1', 'en_revision', 'validacion', :'ahora') \gset
select pruebas.evento(:'t2', 'en_revision', 'validacion', :'ahora') \gset
select pruebas.evento(:'t2', 'en_revision', 'estado', :'ahora') \gset
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar(exists (select 1 from report_attention() where report_id = :'t1' and motivos = array['reabierto']), 'misma fecha: si lo último (por id) es la respuesta, está reabierto');
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'t2'), 'misma fecha: si lo último (por id) es un cambio de estado, ya no');
rollback;

\echo '-- Asignar no mueve el reloj ni cierra un caso reabierto'
select pruebas.caso('en_revision', interval '8 days', 'reloj') as r1 \gset
select pruebas.caso('en_revision', interval '1 hour', 'reabierto y asignado') as r2 \gset
select pruebas.evento(:'r2', 'recibido', 'estado', now() - interval '2 hours') \gset
select pruebas.evento(:'r2', 'en_revision', 'validacion', now() - interval '1 hour') \gset
select updated_at as upd1 from reports where id = :'r1' \gset
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select dias as dias_antes from report_attention() where report_id = :'r1' \gset
select assign_report(:'r1', '11111111-1111-1111-1111-111111111111');
select assign_report(:'r2', '11111111-1111-1111-1111-111111111111');
select pruebas.esperar(exists (select 1 from report_attention() where report_id = :'r1' and motivos = array['estancado'] and dias = :dias_antes), 'asignar un caso estancado no lo saca de "sin movimiento" ni cambia sus días');
select pruebas.esperar(exists (select 1 from report_attention() where report_id = :'r2' and 'reabierto' = any (motivos)), 'asignar un caso reabierto no lo "cierra" (la asignación no cuenta como cambio de estado)');
-- Una evidencia nueva SÍ es movimiento.
select add_evidence(:'r1', :'r1' || '/' || gen_random_uuid() || '.jpg', 'Se limpió el cauce');
select pruebas.esperar(not exists (select 1 from report_attention() where report_id = :'r1'), 'registrar evidencia reinicia el reloj de "sin movimiento"');
reset role;
reset request.jwt.claim.sub;
select pruebas.esperar((select updated_at from reports where id = :'r1') > :'upd1'::timestamptz, 'la evidencia sí actualiza updated_at (y asignar no lo había hecho)');

\echo '-- Motivos que no deben mezclarse'
select pruebas.caso('descartado', interval '60 days', 'descartado viejo') as d1 \gset
select pruebas.caso('atendido', interval '60 days', 'atendido viejo') as d2 \gset
select pruebas.evento(:'d2', 'atendido', 'validacion', now()) \gset
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pruebas.esperar(not exists (select 1 from report_attention() where report_id in (:'d1', :'d2')), 'descartado o atendido (aunque sea viejo o validado) nunca necesita atención');
reset role;
reset request.jwt.claim.sub;

\echo '-- El ticket muestra una nota con texto público, aunque el estado no haya cambiado'
set role anon;
select create_report('fauna', 'Ticket con nota pública del funcionario', 7.8, -76.6, null) as ct \gset
reset role;
select id as rt from reports where tracking_code = :'ct' \gset
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select change_status(:'rt', 'recibido', 'interna', 'Aviso para la persona: vamos a visitar el sitio');
select assign_report(:'rt', '11111111-1111-1111-1111-111111111111');
reset role;
reset request.jwt.claim.sub;
set role anon;
select pruebas.esperar(get_report_tracking(:'ct')::text like '%vamos a visitar el sitio%', 'una nota con texto público sale en el ticket');
select pruebas.esperar(jsonb_array_length(get_report_tracking(:'ct') -> 'eventos') = 2, 'y la asignación sigue sin salir (recibido + la nota)');
reset role;
\echo '-- Atención a fondo: TODO OK'
