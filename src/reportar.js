import { supabase } from './supabase.js';
import { crearMapa, pedirUbicacion, selectorDePunto } from './mapa.js';
import { comprimirFoto } from './foto.js';
import { validarReporte } from './validar.js';
import { copiar, enlaceDeSeguimiento, formatearCodigo } from './ticket.js';
import { captchaActivo, montarCaptcha } from './captcha.js';

const ESPERA_ENTRE_ENVIOS_MS = 30_000;

// Con captcha: el servidor verifica el token, crea el reporte y entrega un permiso para subir la foto.
// Devuelve el código y si la foto pudo subirse (el reporte ya existe aunque la foto falle).
async function enviarConCaptcha({ tipo, descripcion, lat, lng, archivoFoto, token }) {
  const respuesta = await fetch('/api/crear-reporte', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, descripcion, lat, lng, conFoto: Boolean(archivoFoto), token }),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(datos.error ?? `HTTP ${respuesta.status}`);
    error.motivo = datos.error;
    error.estado = respuesta.status;
    error.detalle = Array.isArray(datos.errores) ? datos.errores.join(' ') : '';
    throw error;
  }

  let fotoSubida = true;
  if (datos.subida) {
    try {
      const blob = await comprimirFoto(archivoFoto);
      const { error } = await supabase.storage
        .from('report-photos')
        .uploadToSignedUrl(datos.subida.ruta, datos.subida.token, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
    } catch (error) {
      console.error(error);
      fotoSubida = false;
    }
  }
  return { codigo: datos.codigo, fotoSubida };
}

// Sin captcha: sube la foto (si hay) y crea el reporte directamente.
async function enviarReporte({ tipo, descripcion, lat, lng, archivoFoto }) {
  let rutaFoto = null;

  if (archivoFoto) {
    const blob = await comprimirFoto(archivoFoto);
    rutaFoto = `${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from('report-photos')
      .upload(rutaFoto, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
  }

  const { data: codigo, error } = await supabase.rpc('create_report', {
    p_type: tipo,
    p_description: descripcion,
    p_lat: lat,
    p_lng: lng,
    p_photo_path: rutaFoto,
  });
  if (error) throw error;
  return { codigo, fotoSubida: true };
}

const $ = (id) => document.getElementById(id);
const formulario = $('formulario');
const bloqueErrores = $('errores');
const botonEnviar = $('btn-enviar');

let punto = null;

// Captcha opcional: solo existe si hay VITE_TURNSTILE_SITE_KEY. El token sirve una sola vez.
let tokenCaptcha = null;
let captcha = null;
let captchaNoCargo = false;
let errorDeCaptchaVisible = false;
const MENSAJE_CAPTCHA_NO_CARGO = 'No se pudo cargar la verificación de seguridad. Recargue la página.';

// Los avisos del captcha se quitan solos cuando el recuadro entrega un token nuevo.
function mostrarErrorDeCaptcha(texto) {
  mostrarErrores([texto]);
  errorDeCaptchaVisible = true;
}

if (captchaActivo) {
  $('captcha-bloque').hidden = false;
  montarCaptcha($('captcha'), (token) => {
    tokenCaptcha = token;
    if (token && errorDeCaptchaVisible) mostrarErrores([]);
  })
    .then((c) => {
      captcha = c;
    })
    .catch(() => {
      captchaNoCargo = true;
      mostrarErrorDeCaptcha(MENSAJE_CAPTCHA_NO_CARGO);
    });
}

// Errores del servidor que no son culpa de la persona ni de su conexión.
const MENSAJE_SERVICIO_NO_DISPONIBLE = 'El servicio no está disponible en este momento. Inténtelo más tarde.';
const MENSAJES_CAPTCHA = {
  captcha_requerido: 'Complete la verificación de seguridad.',
  captcha_invalido: 'La verificación de seguridad venció o no es válida. Complétela de nuevo e inténtelo otra vez.',
  captcha_no_disponible: 'No se pudo verificar la seguridad en este momento. Inténtelo en unos segundos.',
};

const mapa = crearMapa('mapa');
const selector = selectorDePunto(mapa, (p) => {
  punto = p;
  $('coordenadas').textContent = `Lugar marcado: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
});

$('btn-ubicacion').addEventListener('click', async () => {
  try {
    const p = await pedirUbicacion();
    selector.fijar(p.lat, p.lng);
    mapa.setView([p.lat, p.lng], 16);
  } catch {
    mostrarErrores(['No pudimos obtener su ubicación. Toque el mapa para marcar el lugar.']);
  }
});

function mostrarErrores(lista) {
  errorDeCaptchaVisible = false;
  bloqueErrores.hidden = lista.length === 0;
  bloqueErrores.textContent = lista.join(' ');
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (botonEnviar.disabled) return; // ya se está enviando: un segundo envío gastaría el token del captcha
  mostrarErrores([]);

  const archivoFoto = $('foto').files[0] ?? null;
  const errores = validarReporte({
    tipo: $('tipo').value,
    descripcion: $('descripcion').value,
    lat: punto?.lat,
    lng: punto?.lng,
  });
  if (archivoFoto && !archivoFoto.type.startsWith('image/')) {
    errores.push('El archivo de la foto debe ser una imagen.');
  }
  if (errores.length > 0) {
    mostrarErrores(errores);
    return;
  }

  // Campo trampa: solo un bot lo llena. Se simula un éxito sin enviar nada.
  if ($('sitio_web').value !== '') {
    mostrarResultado('XXXXXXXXXXXX');
    return;
  }

  // Freno básico contra envíos repetidos desde el mismo dispositivo.
  const ultimoEnvio = Number(localStorage.getItem('ultimoEnvio') ?? 0);
  if (Date.now() - ultimoEnvio < ESPERA_ENTRE_ENVIOS_MS) {
    mostrarErrores(['Espere unos segundos antes de enviar otro reporte.']);
    return;
  }

  if (captchaActivo && !tokenCaptcha) {
    mostrarErrorDeCaptcha(captchaNoCargo ? MENSAJE_CAPTCHA_NO_CARGO : MENSAJES_CAPTCHA.captcha_requerido);
    return;
  }

  botonEnviar.disabled = true;
  botonEnviar.textContent = 'Enviando…';
  try {
    const datos = {
      tipo: $('tipo').value,
      descripcion: $('descripcion').value.trim(),
      lat: punto.lat,
      lng: punto.lng,
      archivoFoto,
    };
    const { codigo, fotoSubida } = captchaActivo
      ? await enviarConCaptcha({ ...datos, token: tokenCaptcha })
      : await enviarReporte(datos);
    localStorage.setItem('ultimoEnvio', String(Date.now()));
    mostrarResultado(codigo, { fotoSubida });
  } catch (error) {
    console.error(error);
    if (MENSAJES_CAPTCHA[error.motivo]) {
      mostrarErrorDeCaptcha(MENSAJES_CAPTCHA[error.motivo]);
    } else if (error.motivo === 'datos_invalidos' && error.detalle) {
      mostrarErrores([error.detalle]);
    } else if (error.estado >= 500) {
      mostrarErrores([MENSAJE_SERVICIO_NO_DISPONIBLE]);
    } else {
      mostrarErrores(['No se pudo enviar el reporte. Revise su conexión e inténtelo de nuevo.']);
    }
  } finally {
    // Cada token de captcha sirve una sola vez, haya salido bien o mal el envío.
    captcha?.reiniciar();
    botonEnviar.disabled = false;
    botonEnviar.textContent = 'Enviar reporte';
  }
});

let codigoEnviado = '';

function mostrarResultado(codigo, { fotoSubida = true } = {}) {
  codigoEnviado = codigo;
  $('aviso-foto').hidden = fotoSubida;
  $('codigo').textContent = formatearCodigo(codigo);
  $('enlace-seguimiento').href = `/seguimiento.html#codigo=${encodeURIComponent(codigo)}`;
  $('copiado').textContent = '';
  formulario.hidden = true;
  $('resultado').hidden = false;
  // El ticket se entrega una sola vez: el foco pasa al título para que se anuncie y no se pierda.
  $('titulo-resultado').focus();
}

async function copiarYAvisar(texto, descripcion) {
  $('copiado').textContent = (await copiar(texto)) ? `${descripcion} copiado.` : 'No se pudo copiar. Selecciónelo y cópielo a mano.';
}

$('btn-copiar-codigo').addEventListener('click', () => copiarYAvisar(formatearCodigo(codigoEnviado), 'Código'));
$('btn-copiar-enlace').addEventListener('click', () =>
  copiarYAvisar(enlaceDeSeguimiento(location.origin, codigoEnviado), 'Enlace')
);

$('btn-otro').addEventListener('click', () => {
  formulario.reset();
  punto = null;
  $('coordenadas').textContent = 'Aún no ha marcado un lugar.';
  $('resultado').hidden = true;
  formulario.hidden = false;
  mapa.invalidateSize();
  $('tipo').focus();
});
