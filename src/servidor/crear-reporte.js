// Lógica del servidor para crear un reporte CON captcha (Cloudflare Turnstile). Corre en una función de Vercel
// (api/crear-reporte.js), nunca en el navegador: allí viven los secretos.
//
// Qué hace, en orden:
//   1. valida los datos con las mismas reglas que el formulario (src/validar.js);
//   2. verifica el token de Turnstile con Cloudflare; si no es válido, no se toca la base de datos;
//   3. si hay foto, pide a Supabase un permiso de subida de un solo uso (el navegador sube la foto con él);
//   4. llama a create_report con la clave service_role (la única que puede, ver supabase/captcha.sql);
//   5. devuelve el código del ticket y, si hay foto, el permiso de subida.
import { validarReporte } from '../validar.js';

const URL_VERIFICACION = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const respuesta = (estado, cuerpo) => ({ estado, cuerpo });

export async function crearReporte({ cuerpo, ip, entorno, verificar = fetch, crearCliente }) {
  const secreto = entorno.TURNSTILE_SECRET_KEY;
  const urlSupabase = entorno.SUPABASE_URL || entorno.VITE_SUPABASE_URL;
  const claveServicio = entorno.SUPABASE_SERVICE_ROLE_KEY;
  if (!secreto || !urlSupabase || !claveServicio) {
    console.error('Falta configurar TURNSTILE_SECRET_KEY, SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.');
    return respuesta(500, { error: 'servidor_sin_configurar' });
  }

  const datos = cuerpo && typeof cuerpo === 'object' ? cuerpo : {};
  const token = typeof datos.token === 'string' ? datos.token : '';
  if (!token || token.length > 2048) {
    return respuesta(400, { error: 'captcha_requerido' });
  }

  const errores = validarReporte({
    tipo: datos.tipo,
    descripcion: typeof datos.descripcion === 'string' ? datos.descripcion : '',
    lat: datos.lat,
    lng: datos.lng,
  });
  if (errores.length > 0) {
    return respuesta(400, { error: 'datos_invalidos', errores });
  }

  // --- Cloudflare Turnstile ---
  let verificacion;
  try {
    const formulario = new URLSearchParams({ secret: secreto, response: token });
    if (ip) formulario.set('remoteip', ip);
    const r = await verificar(URL_VERIFICACION, { method: 'POST', body: formulario, signal: AbortSignal.timeout(8000) });
    verificacion = await r.json();
  } catch (error) {
    console.error('No se pudo contactar a Turnstile:', error?.message);
    return respuesta(502, { error: 'captcha_no_disponible' });
  }
  if (!verificacion?.success) {
    // Los códigos de error se registran en el servidor, pero no se le dan al navegador.
    console.warn('Turnstile rechazó el token:', verificacion?.['error-codes']);
    return respuesta(403, { error: 'captcha_invalido' });
  }
  if (entorno.TURNSTILE_HOSTNAME && verificacion.hostname !== entorno.TURNSTILE_HOSTNAME) {
    console.warn('Turnstile: el token se generó en otro sitio:', verificacion.hostname);
    return respuesta(403, { error: 'captcha_invalido' });
  }

  // --- Supabase (clave service_role: solo existe aquí, nunca en el navegador) ---
  const supabase = crearCliente(urlSupabase, claveServicio, { auth: { persistSession: false } });
  try {
    let subida = null;
    let rutaFoto = null;
    if (datos.conFoto === true) {
      rutaFoto = `${crypto.randomUUID()}.jpg`;
      const { data, error } = await supabase.storage.from('report-photos').createSignedUploadUrl(rutaFoto);
      if (error) throw error;
      subida = { ruta: rutaFoto, token: data.token };
    }

    const { data: codigo, error } = await supabase.rpc('create_report', {
      p_type: datos.tipo,
      p_description: datos.descripcion.trim(),
      p_lat: datos.lat,
      p_lng: datos.lng,
      p_photo_path: rutaFoto,
    });
    if (error) throw error;
    return respuesta(200, { codigo, subida });
  } catch (error) {
    console.error('No se pudo crear el reporte:', error?.message);
    return respuesta(500, { error: 'no_se_pudo_crear' });
  }
}
