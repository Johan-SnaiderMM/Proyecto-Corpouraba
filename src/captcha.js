// Captcha opcional (Cloudflare Turnstile). Se activa solo si existe VITE_TURNSTILE_SITE_KEY; sin esa variable
// el formulario funciona exactamente como antes. La verificación real se hace en el servidor
// (api/crear-reporte.js): este archivo solo muestra el recuadro y entrega el token.
const CLAVE_SITIO = import.meta.env.VITE_TURNSTILE_SITE_KEY;
export const captchaActivo = Boolean(CLAVE_SITIO);

let carga = null;

function cargarScript() {
  carga ??= new Promise((ok, fallo) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = ok;
    script.onerror = () => {
      carga = null; // permite reintentar
      fallo(new Error('No se pudo cargar el captcha.'));
    };
    document.head.append(script);
  });
  return carga;
}

// Dibuja el captcha en "contenedor". alCambiar recibe el token (o null si venció o falló).
// Devuelve { reiniciar }: el token sirve una sola vez, así que hay que pedir uno nuevo después de cada envío.
export async function montarCaptcha(contenedor, alCambiar) {
  await cargarScript();
  const id = window.turnstile.render(contenedor, {
    sitekey: CLAVE_SITIO,
    language: 'es',
    callback: (token) => alCambiar(token),
    'expired-callback': () => alCambiar(null),
    'error-callback': () => alCambiar(null),
  });
  return {
    reiniciar() {
      alCambiar(null);
      window.turnstile.reset(id);
    },
  };
}
