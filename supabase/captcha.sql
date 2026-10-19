-- OPCIONAL: cierra la puerta directa para que SOLO se puedan crear reportes pasando por el captcha.
--
-- Sin este archivo el captcha no sirve de mucho: un robot puede ignorar la página y llamar a create_report
-- con la clave anon, que es pública. Con este archivo, create_report solo puede llamarlo la función de Vercel
-- (api/crear-reporte.js), que primero verifica el captcha y usa la clave service_role.
--
-- ORDEN PARA ACTIVARLO (ver README, sección "Captcha"):
--   1. En Vercel: crear las variables del captcha y volver a desplegar.
--   2. Probar que se puede enviar un reporte desde el sitio publicado.
--   3. Recién entonces, ejecutar este archivo.
-- Para desactivarlo: ejecutar supabase/captcha-desactivar.sql. Ambos se pueden repetir sin problema.

revoke execute on function create_report(report_type, text, double precision, double precision, text) from public, anon, authenticated;
grant execute on function create_report(report_type, text, double precision, double precision, text) to service_role;

-- Las fotos del reporte ya no se suben directo con la clave anon: la función entrega un permiso de subida de un solo uso.
drop policy if exists subir_fotos on storage.objects;
