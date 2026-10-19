-- Deshace supabase/captcha.sql: vuelve a permitir crear reportes y subir fotos directamente desde el navegador.
-- Use este archivo si desactiva el captcha (quite también VITE_TURNSTILE_SITE_KEY en Vercel y vuelva a desplegar).

grant execute on function create_report(report_type, text, double precision, double precision, text) to anon, authenticated;

drop policy if exists subir_fotos on storage.objects;
create policy subir_fotos on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'report-photos');
