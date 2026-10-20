#!/usr/bin/env bash
# Prueba el SQL del proyecto en un Postgres de verdad: crea una base vacía, carga los archivos en el mismo orden
# que en Supabase y corre las pruebas de supabase/tests. Falla (código distinto de 0) si algo no se cumple.
#
# Uso:    bash supabase/tests/ejecutar.sh
# Necesita psql y un servidor Postgres 14 o más nuevo. La conexión se toma de las variables estándar
# (PGHOST, PGPORT, PGUSER, PGPASSWORD); el usuario debe poder crear bases de datos y roles.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
SQL="$AQUI/.."
BASE="${PRUEBAS_BASE:-pruebas_corpouraba}"

admin() { PGDATABASE=postgres psql -X -q -v ON_ERROR_STOP=1 "$@"; }
sql()   { PGDATABASE="$BASE" PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=notice" psql -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "== Base nueva: $BASE"
admin -c "drop database if exists \"$BASE\" with (force)" -c "create database \"$BASE\""

echo "== Cargando el SQL del proyecto"
sql -f "$AQUI/stubs.sql"
sql -f "$SQL/schema.sql"
sql -f "$SQL/seed.sql"
sql -f "$SQL/seguimiento.sql"
echo "== seguimiento.sql por segunda vez (debe poder repetirse)"
sql -f "$SQL/seguimiento.sql"
sql -f "$SQL/asignacion.sql"
echo "== asignacion.sql por segunda vez (debe poder repetirse)"
sql -f "$SQL/asignacion.sql"

echo "== Pruebas del seguimiento"
sql -f "$AQUI/ayudas.sql"
sql -f "$AQUI/seguimiento.test.sql" >/dev/null

echo "== Pruebas de la asignación y los casos pendientes"
sql -f "$AQUI/asignacion.test.sql" >/dev/null

echo "== Casos que necesitan atención: bordes, empates, plazos y zonas horarias"
sql -f "$AQUI/atencion.test.sql" >/dev/null

echo "== asignacion.sql debe negarse a correr sobre una versión vieja de seguimiento.sql"
sql -c "create or replace function get_report_tracking(p_code text) returns jsonb language sql as 'select null::jsonb'"
if sql -f "$SQL/asignacion.sql" >/dev/null 2>&1; then
  echo "FALLÓ: asignacion.sql se ejecutó sobre un seguimiento.sql viejo (aparecerían asignaciones en el ticket)" >&2
  exit 1
fi
sql -f "$SQL/seguimiento.sql"
echo "== ...y con la versión nueva vuelve a funcionar"
sql -f "$SQL/asignacion.sql"

echo "== Datos de demostración (dos veces)"
sql -f "$SQL/demo.sql"
sql -f "$SQL/demo.sql"
sql -f "$AQUI/demo.test.sql" >/dev/null

echo "== Captcha: activar y probar"
sql -f "$SQL/captcha.sql"
sql -f "$AQUI/captcha.test.sql" >/dev/null

echo "== Captcha: repetir seguimiento.sql NO debe reabrir la puerta directa"
sql -f "$SQL/seguimiento.sql"
sql -f "$AQUI/captcha.test.sql" >/dev/null

echo "== Captcha: desactivar y probar"
sql -f "$SQL/captcha-desactivar.sql"
sql -f "$AQUI/captcha-desactivado.test.sql" >/dev/null

echo "== Captcha: volver a activar (y repetirlo)"
sql -f "$SQL/captcha.sql"
sql -f "$SQL/captcha.sql"
sql -f "$AQUI/captcha.test.sql" >/dev/null

echo "== Reversa de asignacion.sql: se puede deshacer, repetir y volver a instalar"
sql -f "$SQL/asignacion-reversa.sql"
sql -f "$SQL/asignacion-reversa.sql"
sql -f "$AQUI/asignacion-reversa.test.sql" >/dev/null
sql -f "$SQL/asignacion.sql"
sql -f "$SQL/captcha.sql"
sql -f "$AQUI/captcha.test.sql" >/dev/null

admin -c "drop database if exists \"$BASE\" with (force)"
echo "== TODO OK"
