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

// Las claves de prueba de Cloudflare (1x…AA, 2x…AA, 3x…AA) aprueban o rechazan todo: sirven para probar en el computador,
// nunca en producción, porque dejarían la API sin captcha de verdad.
const ES_CLAVE_DE_PRUEBA = /^[123]x0{20,}AA$/;

export async function crearReporte(entrada) {
  try {
    return await procesar(entrada);
  } catch (error) {
    // Cualquier cosa inesperada (entrada rara, configuración inválida) termina en un error genérico: nunca se crea
    // un reporte ni se filtran detalles.
    console.error('Error inesperado al crear el reporte:', error?.message);
    return respuesta(500, { error: 'error_interno' });
  }
}

async function procesar({ cuerpo, ip, entorno, verificar = fetch, crearCliente }) {
  const secreto = entorno.TURNSTILE_SECRET_KEY;
  const urlSupabase = entorno.SUPABASE_URL || entorno.VITE_SUPABASE_URL;
  const claveServicio = entorno.SUPABASE_SERVICE_ROLE_KEY;
  if (!secreto || !urlSupabase || !claveServicio) {
    console.error('Falta configurar TURNSTILE_SECRET_KEY, SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.');
    return respuesta(500, { error: 'servidor_sin_configurar' });
  }
  if (entorno.VERCEL_ENV === 'production' && ES_CLAVE_DE_PRUEBA.test(secreto)) {
    console.error('TURNSTILE_SECRET_KEY es una clave de PRUEBA de Cloudflare: en producción no protege nada. Use la real.');
    return respuesta(500, { error: 'servidor_sin_configurar' });
  }

  const datos = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : {};
  const token = typeof datos.token === 'string' ? datos.token : '';
  if (!token || token.length > 2048) {
    return respuesta(400, { error: 'captcha_requerido' });
  }

  const errores = validarReporte({ tipo: datos.tipo, descripcion: datos.descripcion, lat: datos.lat, lng: datos.lng });
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
  // Solo "success: true" (exactamente) aprueba; cualquier otra respuesta, por rara que sea, rechaza.
  if (verificacion?.success !== true) {
    const codigos = verificacion?.['error-codes'];
    console.warn('Turnstile rechazó el token:', codigos);
    // Un fallo interno de Cloudflare no es culpa de la persona: se le pide reintentar, no que repita el captcha.
    if (Array.isArray(codigos) && codigos.includes('internal-error')) {
      return respuesta(502, { error: 'captcha_no_disponible' });
    }
    return respuesta(403, { error: 'captcha_invalido' });
  }
  if (entorno.TURNSTILE_HOSTNAME && verificacion.hostname !== entorno.TURNSTILE_HOSTNAME) {
    console.warn('Turnstile: el token se generó en otro sitio:', verificacion.hostname);
    return respuesta(403, { error: 'captcha_invalido' });
  }

  // --- Supabase (clave service_role: solo existe aquí, nunca en el navegador) ---
  try {
    const supabase = crearCliente(urlSupabase, claveServicio, { auth: { persistSession: false } });
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
